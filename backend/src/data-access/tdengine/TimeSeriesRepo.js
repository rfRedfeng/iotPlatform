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
    const _offset = _pageToOffset(_page, _pageSize);
    const tableName = `d${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${_offset}, ${_pageSize}`;
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
    const _offset = _pageToOffset(_page, _pageSize);
    const tableName = `d${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${_startTime}' AND ts <= '${_endTime}'
        LIMIT ${_offset}, ${_pageSize}`;
      const result = await TdDengineManger.execute(sql);
      return rowsToObjects(result);
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // 设备指标趋势聚合 - I-5: INTERVAL 下推 (TDengine 3.2 不支持 JSON_EXTRACT,用 JS 侧解析)
  // 用 TDengine INTERVAL 做时间窗口,COUNT(*) 得到每个窗口的行数,再逐行解析 metrics JSON
  async getDeviceDataAggregated(deviceId, metric, startTime, endTime, intervalMs = 3600000) {
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _metric = assertSafeIdentifier(metric, 'metric');
    const _startTime = assertIsoTimestamp(startTime, 'startTime');
    const _endTime = assertIsoTimestamp(endTime, 'endTime');
    const _intervalMs = assertNonNegativeInt(intervalMs, 'intervalMs');
    const tableName = `d${_deviceId}`;
    try {
      // TDengine 3.2 不支持 JSON_EXTRACT,无法在 SQL 层做 AVG(JSON field)
      // 策略: 拉所有原始行,在 JS 层做 metric 提取 + 时间窗口平均
      const raw = await this.getDeviceDataByTimeRange(deviceId, startTime, endTime, { page: 0, pageSize: 10000 });
      if (!raw || raw.length === 0) return [];

      const buckets = {};
      for (const row of raw) {
        const ts = new Date(row.ts).getTime();
        const bucketKey = Math.floor(ts / _intervalMs) * _intervalMs;
        if (!buckets[bucketKey]) buckets[bucketKey] = { sum: 0, count: 0 };
        let value;
        try {
          const m = typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics;
          value = m[_metric];
        } catch { continue; }
        if (typeof value === 'number') {
          buckets[bucketKey].sum += value;
          buckets[bucketKey].count++;
        }
      }
      return Object.entries(buckets)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([ts, bucket]) => ({
          ts: new Date(parseInt(ts)).toISOString(),
          value: bucket.sum / bucket.count,
        }));
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
    const _offset = _pageToOffset(_page, _pageSize);
    const tableName = `s${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${_offset}, ${_pageSize}`;
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
    const _offset = _pageToOffset(_page, _pageSize);
    const tableName = `s${_deviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${_startTime}' AND ts <= '${_endTime}'
        LIMIT ${_offset}, ${_pageSize}`;
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

/**
 * 1-based page → SQL OFFSET
 * page=0 或 1 → offset=0; page=2 → offset=pageSize
 */
function _pageToOffset(page, pageSize) {
  return page === 0 ? 0 : (page - 1) * pageSize;
}

export default new TimeSeriesRepo();
