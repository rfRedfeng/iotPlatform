import User from '../models/User.js';
import dataSource from '../DataSourceManger.js';
import { rowToCamel, rowsToCamel } from '../utils/rowMapper.js';

class UserRepository {
  // 查询所有
  async findAll({ page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    // LIMIT/OFFSET 不能作为 prepared-statement 参数，用模板字符串内联（pageSize/offset 已是整数）
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      LIMIT ${pageSize} OFFSET ${offset}`);
    return rowsToCamel(rows);
  }

  // 查询特定用户
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      WHERE ${User.fields.id} = ?`, [id]);
    return rowToCamel(rows[0]) || null;
  }

  // 根据用户名查询
  async findByUsername(username) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      WHERE ${User.fields.username} = ?`, [username]);
    return rowToCamel(rows[0]) || null;
  }

  // 查询特定租客的用户列表
  async findAllByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${User.tableName}
      WHERE ${User.fields.tenantId} = ?
      LIMIT ${pageSize} OFFSET ${offset}`, [tenantId]);
    return rowsToCamel(rows);
  }

  // 添加用户
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    // 把驼峰字段映射到下划线列名
    const fields = User.insertableFields.map(f => User.fields[f]);
    const placeholders = fields.map(() => '?').join(', ');
    // undefined 转为 null，避免 mysql2 报 "Bind parameters must not contain undefined"
    const values = User.insertableFields.map(f => data[f] ?? null);

    const [result] = await pool.execute(`INSERT INTO ${User.tableName} (${fields.join(', ')})
      VALUES (${placeholders})`, values);
    return result.insertId;
  }

  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const updateKeys = User.updatableFields.filter(f => f in data);

    if (updateKeys.length === 0) {
      return false;
    }

    // 同样需要做驼峰 -> 下划线 映射
    const setClause = updateKeys.map(f => `${User.fields[f]} = ?`).join(', ');
    const values = updateKeys.map(f => data[f] ?? null);

    const [result] = await pool.execute(`UPDATE ${User.tableName} SET ${setClause}
      WHERE ${User.fields.id} = ?`, [...values, id]);
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