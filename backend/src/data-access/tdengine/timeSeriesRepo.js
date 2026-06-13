import TdDengineManger from "./TdDengineManger";

import { tdengine } from "../../config/database.js";

class TimeSeriesRepo {
  // 创建设备数据子表
  async insertDeviceDataPoint(DeviceId, TenantId,
    areaId, deviceType, metrics) {
    const conn = await TdDengineManger.getPool();
    const tableName = `d${DeviceId}`;
    try {
      const sql = `CREATE TABLE IF NOT EXISTS ${tableName} 
        USING device_data  TAGS (${DeviceId}, ${TenantId}, ${areaId}, '${deviceType}')`;
      await conn.execute(sql);

      const insertSql = `INSERT INTO ${tableName} 
         VALUES (NOW, '${JSON.stringify(metrics)}')`;
      await conn.execute(insertSql);

    } finally {
      TdDengineManger.putPool(conn);
    }
  }
  // 查询设备数据,根据设备ID查询最新数据
  async getLatestDeviceData(DeviceId, { page = 1, pageSize = 10 }) {
    const conn = await TdDengineManger.getPool();
    const tableName = `d${DeviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${(page - 1) * pageSize}, ${pageSize}`;
      const result = await conn.execute(sql);
      return result;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    } finally {
      TdDengineManger.putPool(conn);
    }
  }

  // 查询设备数据,根据设备ID和时间范围查询数据
  async getDeviceDataByTimeRange(DeviceId, startTime, endTime, { page = 1, pageSize = 10 }) {
    const conn = await TdDengineManger.getPool();
    const tableName = `d${DeviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${startTime}' AND ts <= '${endTime}'
        LIMIT ${(page - 1) * pageSize}, ${pageSize}`;
      const result = await conn.execute(sql);
      return result;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    } finally {
      TdDengineManger.putPool(conn);
    }
  }

  // 更新设备状态子表
  async insertDeviceStatusPoint(DeviceId, TenantId,
    areaId, deviceType, status) {
    const conn = await TdDengineManger.getPool();
    const tableName = `s${DeviceId}`;
    try {
      const sql = `CREATE TABLE IF NOT EXISTS ${tableName} 
        USING device_status  TAGS (${DeviceId}, ${TenantId}, ${areaId}, '${deviceType}')`;
      await conn.execute(sql);

      const insertSql = `INSERT INTO ${tableName} 
         VALUES (NOW, '${status}')`;
      await conn.execute(insertSql);

    } finally {
      TdDengineManger.putPool(conn);
    }
  }

  // 查询设备状态,根据设备ID查询最新状态
  async getLatestDeviceStatus(DeviceId, { page = 1, pageSize = 10 }) {
    const conn = await TdDengineManger.getPool();
    const tableName = `s${DeviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY ts
        DESC LIMIT ${(page - 1) * pageSize}, ${pageSize}`;
      const result = await conn.execute(sql);
      return result;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    } finally {
      TdDengineManger.putPool(conn);
    }
  }

  // 查询设备状态,根据设备ID和时间范围查询状态
  async getDeviceStatusByTimeRange(DeviceId, startTime, endTime, { page = 1, pageSize = 10 }) {
    const conn = await TdDengineManger.getPool();
    const tableName = `s${DeviceId}`;
    try {
      const sql = `SELECT * FROM ${tableName}
        WHERE ts >= '${startTime}' AND ts <= '${endTime}'
        LIMIT ${(page - 1) * pageSize}, ${pageSize}`;
      const result = await conn.execute(sql);
      return result;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    } finally {
      TdDengineManger.putPool(conn);
    }
  }
}

export default new TimeSeriesRepo();