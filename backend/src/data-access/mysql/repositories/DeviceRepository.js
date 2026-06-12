import Device from '../models/Device.js';

import dataSource from '../DataSourceManger.js';

class DeviceRepository {
  // 查询所有设备
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName} 
      LIMIT ? OFFSET ?`, [pageSize, offset]);
    return rows || null;
  }

  // 根据租客ID查询设备列表
  async findByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName} 
      WHERE ${Device.fields.tenantId} = ? 
      LIMIT ? OFFSET ?`, [tenantId, pageSize, offset]);
    return rows || null;
  }

  // 根据租客ID和区域ID查询设备列表
  async findByAreaId(tenantId, areaId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName} 
      WHERE ${Device.fields.tenantId} = ? AND ${Device.fields.areaId} = ? 
      LIMIT ? OFFSET ?`, [tenantId, areaId, pageSize, offset]);
    return rows || null;
  }

  // 根据设备ID查询设备详情
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName} 
      WHERE ${Device.fields.id} = ?`, [id]);
    return rows[0] || null;
  }

  // 根据设备Key查询设备详情
  async findByDeviceKey(deviceKey) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Device.tableName} 
      WHERE ${Device.fields.deviceKey} = ?`, [deviceKey]);
    return rows[0] || null;
  }

  // 添加设备
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Device.insertableFields;
    const placeholders = fields.map(() => '?').join(', ');

    const [result] = await pool.execute(`INSERT INTO ${Device.tableName} (${fields.join(', ')}) 
      VALUES (${placeholders})`, fields.map(field => data[field]));
    return result.insertId;
  }

  // 更新设备信息
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const fields = Device.updatableFields.filter(field => field in data);

    if (fields.length === 0) {
      return false;
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const [result] = await pool.execute(`UPDATE ${Device.tableName} SET ${setClause} 
      WHERE ${Device.fields.id} = ?`, [...fields.map(field => data[field]), id]);
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