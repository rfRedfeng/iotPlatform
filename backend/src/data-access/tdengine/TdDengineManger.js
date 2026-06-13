import ws from '@tdengine/websocket';
import { tdengine } from '../../config/database.js';

class TdDengineManger {
  constructor() {
    this.pool = [];
    this.activeConnections = 0;
    this.poolSize = 5; // 连接池大小
    this.maxConnections = 10; // 最大连接数
    this.url = `ws://${tdengine.user}:${tdengine.password}@${tdengine.host}:${tdengine.port}`;
    this.database = tdengine.database;
  }

  // 等待空闲连接
  waitForConnection() {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(interval);
          resolve(this.pool.pop());
        }
      }, 100);
    });
  }

  // 获取连接（从池中获取或创建新连接）
  async getPool() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    if (this.activeConnections < this.maxConnections) {
      const conn = await ws.connect(this.url);
      await conn.execute(`USE ${this.database}`);
      this.activeConnections++;
      return conn;
    }
    return this.waitForConnection();
  }

  // 归还连接到池中
  putPool(conn) {
    this.pool.push(conn);
  }

  // 初始化连接池
  async initPool(poolSize = 5) {
    for (let i = 0; i < poolSize; i++) {
      const conn = await ws.connect(this.url);
      await conn.execute(`USE ${this.database}`);
      this.putPool(conn);
      this.activeConnections++;
    }
  }

  async getPoolStatus() {
    return {
      availableConnections: this.pool.length,
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
    };
  }
}

export default new TdDengineManger();