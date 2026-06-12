import Area from '../models/Area.js'
import dataSource from '../DataSourceManger.js'

class AreaRepository {

  // 根据id查询
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Area.tableName} 
      WHERE ${Area.fields.id} = ?`, [id]);
    return rows[0] || null;
  }

  // 根据租客id查询区域列表
  async findAllByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Area.tableName} 
      WHERE ${Area.fields.tenantId} = ? 
      LIMIT ? OFFSET ?`, [tenantId, pageSize, offset]);
    return rows || null;
  }

  // 查询特定层级的数据
  async findAllByParentId(tenantId, parentId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;

    let sql = `SELECT * FROM ${Area.tableName}`;
    const params = [];

    if (parentId === null) {
      sql += `WHERE ${Area.fields.parentId} IS NULL`;
    } else {
      sql += `WHERE ${Area.fields.parentId} = ?`;
      params.push(parentId);
    }

    sql += ` AND ${Area.fields.tenantId} = ? LIMIT ? OFFSET ?`;
    params.push(tenantId, pageSize, offset);

    const [rows] = await pool.execute(sql, params);

    return rows || null;
  }

  // 新增数据
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Area.insertableFields;
    const placeholders = fields.map(() => '?').join(', ');

    const [result] = await pool.execute(`INSERT INTO ${Area.tableName} (${fields.join(', ')}) 
      VALUES (${placeholders})`, fields.map(field => data[field]));
    return result.insertId;
  }

  // 更新数据
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const fields = Area.updatableFields.filter(field => field in data);

    if (fields.length === 0) {
      return false;
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const [result] = await pool.execute(`UPDATE ${Area.tableName} SET ${setClause} 
      WHERE ${Area.fields.id} = ?`, [...fields.map(field => data[field]), id]);
    return result.affectedRows > 0;
  }

  // 删除数据
  async delete(id) {
    const pool = dataSource.getMysqlPool();
    const [result] = await pool.execute(`DELETE FROM ${Area.tableName} 
      WHERE ${Area.fields.id} = ?`, [id]);
    return result.affectedRows > 0;
  }
}

export default new AreaRepository();