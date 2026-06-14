import AlertEvent from '../models/AlertEvent.js';

import dataSource from '../DataSourceManger.js';
import { rowToCamel, rowsToCamel } from '../utils/rowMapper.js';

class AlertEventRepository {
  // 分页查询所有告警事件
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${AlertEvent.tableName}
      ORDER BY ${AlertEvent.fields.triggeredAt} DESC
      LIMIT ${pageSize} OFFSET ${offset}`);
    return rowsToCamel(rows);
  }

  // 根据租户ID查询告警事件，支持分页
  async findByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${AlertEvent.tableName}
      WHERE ${AlertEvent.fields.tenantId} = ?
      ORDER BY ${AlertEvent.fields.triggeredAt} DESC
      LIMIT ${pageSize} OFFSET ${offset}`, [tenantId]);
    return rowsToCamel(rows);
  }

  // 根据规则ID查询告警事件，支持分页
  async findByRuleId(ruleId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${AlertEvent.tableName}
      WHERE ${AlertEvent.fields.ruleId} = ?
      ORDER BY ${AlertEvent.fields.triggeredAt} DESC
      LIMIT ${pageSize} OFFSET ${offset}`, [ruleId]);
    return rowsToCamel(rows);
  }

  // 根据设备ID查询告警事件，支持分页
  async findByDeviceId(deviceId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${AlertEvent.tableName}
      WHERE ${AlertEvent.fields.deviceId} = ?
      ORDER BY ${AlertEvent.fields.triggeredAt} DESC
      LIMIT ${pageSize} OFFSET ${offset}`, [deviceId]);
    return rowsToCamel(rows);
  }

  // 根据ID查询告警事件
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${AlertEvent.tableName}
      WHERE ${AlertEvent.fields.id} = ?`, [id]);
    return rowToCamel(rows[0]) || null;
  }

  // 创建新的告警事件
  async create(alertEvent) {
    const pool = dataSource.getMysqlPool();
    const fields = AlertEvent.insertableFields.map(field => AlertEvent.fields[field]);
    const values = AlertEvent.insertableFields.map(field => alertEvent[field] ?? null);
    const placeholders = fields.map(() => '?').join(', ');
    const query = `INSERT INTO ${AlertEvent.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await pool.execute(query, values);
    return result.insertId;
  }

  // 更新告警事件
  async update(id, alertEvent) {
    const pool = dataSource.getMysqlPool();
    const updateKeys = AlertEvent.updatableFields.filter(field => field in alertEvent);
    if (updateKeys.length === 0) {
      return false; // 没有可更新的字段
    }

    const setClause = updateKeys.map(field => `${AlertEvent.fields[field]} = ?`).join(', ');
    const values = updateKeys.map(field => alertEvent[field] ?? null);
    const [result] = await pool.execute(`UPDATE ${AlertEvent.tableName} SET ${setClause}
      WHERE ${AlertEvent.fields.id} = ?`, [...values, id]);
    return result.affectedRows > 0;
  }

  // 删除告警事件
  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(`DELETE FROM ${AlertEvent.tableName} 
      WHERE ${AlertEvent.fields.id} = ?`, [id]);
    return result.affectedRows > 0;
  }

}

export default new AlertEventRepository();