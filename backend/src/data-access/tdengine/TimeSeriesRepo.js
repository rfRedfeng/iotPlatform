import TdDengineManger from "./TdDengineManger.js";
import {
  assertIntegerId,
  assertNonNegativeInt,
  assertIsoTimestamp,
  assertEnum,
  assertSafeIdentifier,
  escapeTdengineString,
  jsonToTdengineString,
} from '../../utils/sqlSanitizer.js';

const ALLOWED_PROTOCOLS = ['mqtt', 'tcp', 'udp', 'coap', 'generic'];
const ALLOWED_STATUSES = ['online', 'offline', 'error'];

/**
 * 把 TDengine REST 返回的行数组（每行 = 数组）按列名转成对象数组。
 * TDengine REST 的响应结构是 { column_meta: [[name, type, len], ...], data: [[v1, v2, ...], ...] }
 * 业务代码习惯按 row.ts / row.metrics 取值，所以这里做一层适配。
 */
function rowsToObjects(result) {
  if (!result) return [];
  const { column_meta, data } = result;
  if (!Array.isArray(data) || !Array.isArray(column_meta)) return [];
  return data.map((rowArr) => {
    const obj = {};
    column_meta.forEach((col, i) => {
      obj[col[0]] = rowArr[i];
    });
    return obj;
  });
}

class TimeSeriesRepo {
  // 创建设备数据子表
  async insertDeviceDataPoint(deviceId, tenantId,
    areaId, deviceType, metrics) {
    // C-2/C-3: 入口白名单校验 - 防止 SQL 注入
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _tenantId = assertIntegerId(tenantId, 'tenantId');
    const _areaId = areaId == null ? 0 : assertIntegerId(areaId, 'areaId');
    const _deviceType = assertSafeIdentifier(deviceType, 'deviceType');
    const _metricsJson = jsonToTdengineString(metrics, 'metrics');

    const tableName = `d${_deviceId}`;
    const sql = `CREATE TABLE IF NOT EXISTS ${tableName}
      USING device_data TAGS (${_deviceId}, ${_tenantId}, ${_areaId}, '${_deviceType}')`;
    await TdDengineManger.execute(sql);

    const insertSql = `INSERT INTO ${tableName}
       VALUES (NOW, '${_metricsJson}')`;
    await TdDengineManger.execute(insertSql);
  }

  // 查询设备数据,根据设备ID查询最新数据
  async getLatestDeviceData(deviceId, { page = 1, pageSize = 10 } = {}) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _page = assertNonNegativeInt(page, 'page');
    const _pageSize = assertNonNegativeInt(pageSize, 'pageSize');
    const tableName = `d${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${_page * _pageSize}, ${_pageSize}`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // 查询设备数据,根据设备ID和时间范围查询数据
  async getDeviceDataByTimeRange(deviceId, startTime, endTime, { page = 1, pageSize = 10 } = {}) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _startTime = assertIsoTimestamp(startTime, 'startTime');
    const _endTime = assertIsoTimestamp(endTime, 'endTime');
    const _page = assertNonNegativeInt(page, 'page');
    const _pageSize = assertNonNegativeInt(pageSize, 'pageSize');
    const tableName = `d${_deviceId}`;
    try {
      // C-2: 用户可控的 startTime/endTime 经 assertIsoTimestamp 严格校验后,这里
      // 仍保留单引号包裹,但因为内容必然形如 "2024-01-01T00:00:00Z",
      // 任何特殊字符都会被白名单拒掉,无法逃逸。
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${_startTime}' AND ts <= '${_endTime}'
        LIMIT ${_page * _pageSize}, ${_pageSize}`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // 设备指标趋势聚合 - I-5: INTERVAL 下推 (避免在 Node 进程里做降采样)
  async getDeviceDataAggregated(deviceId, metric, startTime, endTime, intervalMs = 3600000) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _metric = assertSafeIdentifier(metric, 'metric');
    const _startTime = assertIsoTimestamp(startTime, 'startTime');
    const _endTime = assertIsoTimestamp(endTime, 'endTime');
    const _intervalMs = assertNonNegativeInt(intervalMs, 'intervalMs');
    const tableName = `d${_deviceId}`;
    try {
      const sql = `SELECT _wstart AS ts, AVG(JSON_EXTRACT(metrics, '$.${_metric}')) AS value
        FROM ${tableName}
        WHERE ts >= '${_startTime}' AND ts <= '${_endTime}'
        INTERVAL(${_intervalMs}a)
        ORDER BY ts ASC`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // 更新设备状态子表
  async insertDeviceStatusPoint(deviceId, tenantId,
    areaId, deviceType, status) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _tenantId = assertIntegerId(tenantId, 'tenantId');
    const _areaId = areaId == null ? 0 : assertIntegerId(areaId, 'areaId');
    const _deviceType = assertSafeIdentifier(deviceType, 'deviceType');
    const _status = assertEnum(status, ALLOWED_STATUSES, 'status');

    const tableName = `s${_deviceId}`;
    const sql = `CREATE TABLE IF NOT EXISTS ${tableName}
      USING device_status TAGS (${_deviceId}, ${_tenantId}, ${_areaId}, '${_deviceType}')`;
    await TdDengineManger.execute(sql);

    const insertSql = `INSERT INTO ${tableName}
       VALUES (NOW, '${_status}')`;
    await TdDengineManger.execute(insertSql);
  }

  // 查询设备状态,根据设备ID查询最新状态
  async getLatestDeviceStatus(deviceId, { page = 1, pageSize = 10 } = {}) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _page = assertNonNegativeInt(page, 'page');
    const _pageSize = assertNonNegativeInt(pageSize, 'pageSize');
    const tableName = `s${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${_page * _pageSize}, ${_pageSize}`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // 查询设备状态,根据设备ID和时间范围查询状态
  async getDeviceStatusByTimeRange(deviceId, startTime, endTime, { page = 1, pageSize = 10 } = {}) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _startTime = assertIsoTimestamp(startTime, 'startTime');
    const _endTime = assertIsoTimestamp(endTime, 'endTime');
    const _page = assertNonNegativeInt(page, 'page');
    const _pageSize = assertNonNegativeInt(pageSize, 'pageSize');
    const tableName = `s${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${_startTime}' AND ts <= '${_endTime}'
        LIMIT ${_page * _pageSize}, ${_pageSize}`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }
}

export default new TimeSeriesRepo();
