import AlertRule from '../models/AlertRule.js';
import dataSource from '../DataSourceManger.js'


class AlertRuleRepository {
  // 分页查询所有告警规则
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const query = `SELECT * FROM ${AlertRule.tableName} LIMIT ? OFFSET ?`;
    const [rows] = await pool.execute(query, [pageSize, offset]);
    return rows;
  }

  // 根据租户ID查询告警规则，支持分页
  async findByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const query = `SELECT * FROM ${AlertRule.tableName} WHERE ${AlertRule.fields.tenantId} = ? LIMIT ? OFFSET ?`;
    const [rows] = await pool.execute(query, [tenantId, pageSize, offset]);
    return rows;
  }

  // 根据设备ID查询告警规则，支持分页
  async findByDeviceId(tenantId, deviceId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const query = `SELECT * FROM ${AlertRule.tableName} WHERE ${AlertRule.fields.tenantId} = ? AND ${AlertRule.fields.deviceId} = ? LIMIT ? OFFSET ?`;
    const [rows] = await pool.execute(query, [tenantId, deviceId, pageSize, offset]);
    return rows;
  }

  // 根据租户ID和设备ID查询所有告警规则，用于告警引擎评估时使用，不分页
  async findByTenantIdAndDeviceId(tenantId, deviceId) {
    const pool = dataSource.getMysqlPool();
    const query = `SELECT * FROM ${AlertRule.tableName} WHERE ${AlertRule.fields.tenantId} = ? AND ${AlertRule.fields.deviceId} = ?`;
    const [rows] = await pool.execute(query, [tenantId, deviceId]);
    return rows;
  }

  // 根据ID查询告警规则
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const query = `SELECT * FROM ${AlertRule.tableName} WHERE ${AlertRule.fields.id} = ?`;
    const [rows] = await pool.execute(query, [id]);
    return rows[0] || null;
  }

  // 创建新的告警规则
  async create(alertRule) {
    const pool = dataSource.getMysqlPool();
    const fields = AlertRule.insertableFields.map(field => AlertRule.fields[field]);
    const values = AlertRule.insertableFields.map(field => alertRule[field]);
    const placeholders = fields.map(() => '?').join(', ');
    const query = `INSERT INTO ${AlertRule.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const [result] = await pool.execute(query, values);
    return result.insertId;
  }

  // 更新告警规则
  async update(id, alertRule) {
    const pool = dataSource.getMysqlPool();
    const fields = AlertRule.updatableFields.filter(field => field in alertRule);
    if (fields.length === 0) {
      return false; // 没有可更新的字段
    }

    const setClause = fields.map(field => `${AlertRule.fields[field]} = ?`).join(', ');
    const [result] = await pool.execute(`UPDATE ${AlertRule.tableName} SET ${setClause} 
      WHERE ${AlertRule.fields.id} = ?`, [...fields.map(field => alertRule[field]), id]);
    return result.affectedRows > 0;
  }

  // 删除告警规则
  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const query = `DELETE FROM ${AlertRule.tableName} WHERE ${AlertRule.fields.id} = ?`;
    const [result] = await pool.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

export default new AlertRuleRepository();
