import Cache from './CacheManager.js';

class SessionStore {
  constructor() {
    this.cache = new Cache();
  }
  // ========== 刷新令牌 ==========
  // 设置刷新令牌，获取用户ID，ttlSeconds 是过期时间（单位：秒）
  async storeRefreshToken(token, userId, ttlSeconds = 7 * 24 * 3600) {
    const key = `refresh_token:${token}`;
    const sessionData = { userId };
    return await this.cache.set(key, JSON.stringify(sessionData), ttlSeconds);
  }

  // 获取用户ID通过刷新令牌
  async getUserIdByToken(token) {
    const key = `refresh_token:${token}`;
    const sessionData = await this.cache.get(key);
    return sessionData ? JSON.parse(sessionData).userId : null;
  }

  // 删除刷新令牌
  async deleteRefreshToken(token) {
    const key = `refresh_token:${token}`;
    return await this.cache.del(key);
  }

  // ========== 会话管理 ==========
  // 存储会话数据，sessionData 是一个对象，ttlSeconds 是过期时间（单位：秒）
  async storeSession(userId, sessionData, ttlSeconds = 15 * 60) {
    const key = `session:${userId}`;
    const jsonData = JSON.stringify(sessionData);
    return await this.cache.set(key, jsonData, ttlSeconds);
  }

  // 获取会话数据
  async getSession(userId) {
    const key = `session:${userId}`;
    const jsonData = await this.cache.get(key);
    return jsonData ? JSON.parse(jsonData) : null;
  }

  // 删除会话数据
  async deleteSession(userId) {
    const key = `session:${userId}`;
    return await this.cache.del(key);
  }

}

export default new SessionStore();