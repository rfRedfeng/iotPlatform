import RefreshToken from '../models/RefreshToken.js';
import dataSource from '../DataSourceManger.js';

// Refresh_token的存储和查询
class RefreshTokenRepository {
  async create(data) {
    const pool = dataSource.getMysqlPool();
    const fields = RefreshToken.insertableFields;
    const placeholders = fields.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `INSERT INTO ${RefreshToken.tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
      fields.map(field => data[field])
    );
    return result.insertId;
  }

  async findByToken(token) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(
      `SELECT * FROM ${RefreshToken.tableName} WHERE ${RefreshToken.fields.token} = ?`,
      [token]
    );
    return rows[0] || null;
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
}

export default new RefreshTokenRepository();