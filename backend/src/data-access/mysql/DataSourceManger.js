import mysql from 'mysql2/promise';

import { mysql as mysqlConfig } from '../../config/database.js';

class DataSourceManager {

  createMysqlPool() { // 创建mysql连接池 工厂方法
    const pool = mysql.createPool(mysqlConfig);
    return pool;
  }

  getMysqlPool() {  // 获取mysql连接池 单例模式
    if (!this.mysqlPool) {
      this.mysqlPool = this.createMysqlPool();
    }
    return this.mysqlPool;
  }

  async closeAllPools() {
    try {
      await this.mysqlPool.end();
      console.log('关闭MySQL连接池成功');
    } catch (err) {
      console.error('关闭MySQL连接池失败:', err);
    }
  }
}

export default new DataSourceManager();