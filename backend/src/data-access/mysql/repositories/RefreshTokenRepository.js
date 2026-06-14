import RefreshToken from '../models/RefreshToken.js';
import dataSource from '../DataSourceManger.js';
import { rowToCamel } from '../utils/rowMapper.js';

// Refresh_token的存储和查询
class RefreshTokenRepository {
  async create(data) {
    const pool = dataSource.getMysqlPool();
    const fields = RefreshToken.insertableFields.map(f => RefreshToken.fields[f]);
    const placeholders = fields.map(() => '?').join(', ');
    const values = RefreshToken.insertableFields.map(f => data[f] ?? null);
    const [result] = await pool.execute(
      `INSERT INTO ${RefreshToken.tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
      values
    );
    return result.insertId;
  }

  async findByToken(token) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${RefreshToken.tableName} WHERE ${RefreshToken.fields.token} = ?`,
      [token]
    );
    return rowToCamel(rows[0]) || null;
  }

  async deleteByToken(token) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(
      `DELETE FROM ${RefreshToken.tableName} WHERE ${RefreshToken.fields.token} = ?`,
      [token]
    );
    return result.affectedRows > 0;
  }

  async deleteExpired() {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(
      `DELETE FROM ${RefreshToken.tableName} WHERE ${RefreshToken.fields.expiresAt} < NOW()`
    );
    return result.affectedRows;
  }

  /**
   * 删除某用户的所有 refreshToken (C-1 logout 用)
   * 让所有设备的登录态都失效,真正的"登出"
   */
  async deleteAllForUser(userId) {
    if (!userId) return 0;
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(
      `DELETE FROM ${RefreshToken.tableName} WHERE ${RefreshToken.fields.userId} = ?`,
      [userId]
    );
    return result.affectedRows;
  }
}

export default new RefreshTokenRepository();