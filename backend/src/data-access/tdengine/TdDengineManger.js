import { tdengine } from '../../config/database.js';

class TdDengineManger {
  constructor() {
    this.host = tdengine.host;
    this.port = tdengine.port;
    this.user = tdengine.user;
    this.password = tdengine.password;
    this.database = tdengine.database;
    this.baseUrl = `http://${this.host}:${this.port}/rest/sql`;
    this.authHeader = 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');
  }

  /**
   * 执行 SQL，返回 TDengine REST 响应体：
   *   { code, column_meta, data, rows }
   * 数据库通过 URL path 传递（/rest/sql/<db>），无需 USE 切换。
   */
  async execute(sql) {
    const url = `${this.baseUrl}/${this.database}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sql,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      throw new Error(`TDengine 返回非 JSON (status=${res.status}, body=${text.slice(0, 200)})`);
    }
    if (!json || json.code !== 0) {
      const err = new Error(`TDengine SQL 失败: ${json?.desc ?? 'empty response'}`);
      err.code = json?.code;
      err.sql = sql;
      throw err;
    }
    // 返回完整响应 { column_meta, data, rows }，由 TimeSeriesRepo 把 data 数组按 column_meta 拼成对象
    return json;
  }

  // 兼容旧接口：TimeSeriesRepo 仍以 conn.execute 调用，conn = this
  async getPool() {
    return this;
  }
  putPool() {
    // no-op（REST 无连接可还）
  }
  async close() {
    // no-op
  }
  async initPool() {
    // no-op
  }
  async getPoolStatus() {
    return { availableConnections: 0, activeConnections: 0, maxConnections: 0 };
  }
}

export default new TdDengineManger();