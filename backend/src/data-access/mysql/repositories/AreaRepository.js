import Area from '../models/Area.js'
import dataSource from '../DataSourceManger.js'
import { rowToCamel, rowsToCamel } from '../utils/rowMapper.js';

class AreaRepository {

  // 根据id查询
  async findById(id) {
    const pool = dataSource.getMysqlPool();
    const [rows] = await pool.execute(`SELECT * FROM ${Area.tableName}
      WHERE ${Area.fields.id} = ?`, [id]);
    return rowToCamel(rows[0]) || null;
  }

  // 根据租客id查询区域列表
  async findAllByTenantId(tenantId, { page = 1, pageSize = 20 } = {}) {
    const pool = dataSource.getMysqlPool();
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(`SELECT * FROM ${Area.tableName}
      WHERE ${Area.fields.tenantId} = ?
      LIMIT ${pageSize} OFFSET ${offset}`, [tenantId]);
    return rowsToCamel(rows);
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

    sql += ` AND ${Area.fields.tenantId} = ? LIMIT ${pageSize} OFFSET ${offset}`;
    params.push(tenantId);

    const [rows] = await pool.execute(sql, params);

    return rowsToCamel(rows);
  }

  // 新增数据
  async insert(data) {
    const pool = dataSource.getMysqlPool();
    const fields = Area.insertableFields.map(f => Area.fields[f]);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Area.insertableFields.map(f => data[f] ?? null);

    const [result] = await pool.execute(`INSERT INTO ${Area.tableName} (${fields.join(', ')})
      VALUES (${placeholders})`, values);
    return result.insertId;
  }

  // 更新数据
  async update(id, data) {
    const pool = dataSource.getMysqlPool();
    const updateKeys = Area.updatableFields.filter(f => f in data);

    if (updateKeys.length === 0) {
      return false;
    }

    const setClause = updateKeys.map(f => `${Area.fields[f]} = ?`).join(', ');
    const values = updateKeys.map(f => data[f] ?? null);

    const [result] = await pool.execute(`UPDATE ${Area.tableName} SET ${setClause}
      WHERE ${Area.fields.id} = ?`, [...values, id]);
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