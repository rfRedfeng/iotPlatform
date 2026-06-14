import Tenant from '../models/Tenant.js';
import dataSource from '../DataSourceManger.js';
import { rowToCamel, rowsToCamel } from '../utils/rowMapper.js';

class TenantRepository {
  // 查询所有
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Tenant.tableName}
      LIMIT ${pageSize} OFFSET ${offset}`);
    return rowsToCamel(rows);
  }

  // 查询特定id
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Tenant.tableName}
      WHERE ${Tenant.fields.id} = ?`, [id]);
    return rowToCamel(rows[0]) || null;
  }

  // 添加数据
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Tenant.insertableFields.map(f => Tenant.fields[f]);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Tenant.insertableFields.map(f => data[f] ?? null);

    const [result] = await pool.execute(`INSERT INTO ${Tenant.tableName} (${fields.join(', ')})
      VALUES (${placeholders})`, values);
    return result.insertId;
  }

  // 更新特定数据 data 例:{ name: '新租户名称' }
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const updateKeys = Tenant.updatableFields.filter(f => f in data);

    if (updateKeys.length === 0) {
      return false;
    }
    const setClause = updateKeys.map(f => `${Tenant.fields[f]} = ?`).join(', ');
    const values = updateKeys.map(f => data[f] ?? null);

    const [result] = await pool.execute(`UPDATE ${Tenant.tableName} SET ${setClause}
      WHERE ${Tenant.fields.id} = ?`, [...values, id]);
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