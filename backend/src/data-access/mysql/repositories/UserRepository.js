import User from '../models/User.js';
import dataSource from '../DataSourceManger.js';

class UserRepository {
  // 查询所有
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName} 
      LIMIT ? OFFSET ?`, [pageSize, offset]);
    return rows || null;
  }

  // 查询特定用户
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      WHERE ${User.fields.id} = ?`, [id]);
    return rows[0] || null;
  }

  // 根据用户名查询
  async findByUsername(username) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      WHERE ${User.fields.username} = ?`, [username]);
    return rows[0] || null;
  }

  // 查询特定租客的用户列表
  async findAllByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName} 
      WHERE ${User.fields.tenantId} = ? 
      LIMIT ? OFFSET ?`, [tenantId, pageSize, offset]);
    return rows || null;
  }

  // 添加用户
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = User.insertableFields;
    const placeholders = fields.map(() => '?').join(', ');

    const [result] = await pool.execute(`INSERT INTO ${User.tableName} (${fields.join(', ')}) 
      VALUES (${placeholders})`, fields.map(field => data[field]));
    return result.insertId;
  }

  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const fields = User.updatableFields.filter(field => field in data);

    if (fields.length === 0) {
      return false;
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const [result] = await pool.execute(`UPDATE ${User.tableName} SET ${setClause} 
      WHERE ${User.fields.id} = ?`, [...fields.map(field => data[field]), id]);
    return result.affectedRows > 0;
  }

  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(`DELETE FROM ${User.tableName} 
      WHERE ${User.fields.id} = ?`, [id]);
    return result.affectedRows > 0;
  }
}

export default new UserRepository();