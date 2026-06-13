import Tenant from '../models/Tenant.js';
import dataSource from '../DataSourceManger.js';

class TenantRepository {
  // 查询所有
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Tenant.tableName} 
      LIMIT ? OFFSET ?`, [pageSize, offset]);
    return rows || null;
  }

  // 查询特定id
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Tenant.tableName} 
      WHERE ${Tenant.fields.id} = ?`, [id]);
    return rows[0] || null;
  }

  // 添加数据
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Tenant.insertableFields;
    const placeholders = fields.map(() => '?').join(', ');

    const [result] = await pool.execute(`INSERT INTO ${Tenant.tableName} (${fields.join(', ')}) 
      VALUES (${placeholders})`, fields.map(field => data[field]));
    return result.insertId;
  }

  // 更新特定数据 data 例:{ name: '新租户名称' }
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const fields = Tenant.updatableFields.filter(f => f in data);

    if (fields.length === 0) {
      return false;
    }
    const setClause = fields.map(field => `${field} = ?`).join(', ');

    const [result] = await pool.execute(`UPDATE ${Tenant.tableName} SET ${setClause} 
      WHERE ${Tenant.fields.id} = ?`, [...fields.map(field => data[field]), id]);
    return result.affectedRows > 0;
  }

  // 删除特定数据
  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(`DELETE FROM ${Tenant.tableName} 
      WHERE ${Tenant.fields.id} = ?`, [id]);
    return result.affectedRows > 0;
  }
}

export default new TenantRepository();