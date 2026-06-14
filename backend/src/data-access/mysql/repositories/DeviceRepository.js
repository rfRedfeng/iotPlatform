import Device from '../models/Device.js';

import dataSource from '../DataSourceManger.js';
import { rowToCamel, rowsToCamel } from '../utils/rowMapper.js';

class DeviceRepository {
  // 查询所有设备
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName}
      LIMIT ${pageSize} OFFSET ${offset}`);
    return rowsToCamel(rows);
  }

  // 根据租客ID查询设备列表
  async findByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName}
      WHERE ${Device.fields.tenantId} = ?
      LIMIT ${pageSize} OFFSET ${offset}`, [tenantId]);
    return rowsToCamel(rows);
  }

  // 根据租客ID和区域ID查询设备列表
  async findByAreaId(tenantId, areaId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName}
      WHERE ${Device.fields.tenantId} = ? AND ${Device.fields.areaId} = ?
      LIMIT ${pageSize} OFFSET ${offset}`, [tenantId, areaId]);
    return rowsToCamel(rows);
  }

  // 根据设备ID查询设备详情
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName}
      WHERE ${Device.fields.id} = ?`, [id]);
    return rowToCamel(rows[0]) || null;
  }

  // 根据设备Key查询设备详情
  async findByDeviceKey(deviceKey) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName}
      WHERE ${Device.fields.deviceKey} = ?`, [deviceKey]);
    return rowToCamel(rows[0]) || null;
  }

  // 添加设备
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Device.insertableFields.map(f => Device.fields[f]);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Device.insertableFields.map(f => data[f] ?? null);

    const [result] = await pool.execute(`INSERT INTO ${Device.tableName} (${fields.join(', ')})
      VALUES (${placeholders})`, values);
    return result.insertId;
  }

  // 更新设备信息
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const updateKeys = Device.updatableFields.filter(f => f in data);

    if (updateKeys.length === 0) {
      return false;
    }

    const setClause = updateKeys.map(f => `${Device.fields[f]} = ?`).join(', ');
    const values = updateKeys.map(f => data[f] ?? null);

    const [result] = await pool.execute(`UPDATE ${Device.tableName} SET ${setClause}
      WHERE ${Device.fields.id} = ?`, [...values, id]);
    return result.affectedRows > 0;
  }

  // 删除设备
  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(`DELETE FROM ${Device.tableName} 
      WHERE ${Device.fields.id} = ?`, [id]);
    return result.affectedRows > 0;
  }
}

export default new DeviceRepository();