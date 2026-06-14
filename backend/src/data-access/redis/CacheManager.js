import redis from 'redis';
import { redis as redisConfig } from '../../config/database.js';

class CacheManager {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * 获取 Redis 客户端，单例模式，生命周期内只连接一次
   */
  async getClient() {
    if (!this.client) {
      this.client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
        },
        password: redisConfig.password,
        database: redisConfig.db,
      });
    }

    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }

    return this.client;
  }

  // ========== 基本方法 ==========
  async set(key, value, ttlSeconds = 3600) {
    if (typeof key !== 'string' || key.length === 0) {
      return false;
    }
    const client = await this.getClient();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    // I-6: 原子 SET + EX (避免 set + expire 两步之间崩溃导致永久驻留)
    if (ttlSeconds > 0) {
      await client.set(key, stringValue, { EX: ttlSeconds });
    } else {
      await client.set(key, stringValue);
    }
    return true;
  }

  async get(key) {
    if (typeof key !== 'string' || key.length === 0) {
      return null;
    }
    const client = await this.getClient();
    const value = await client.get(key);
    return value ?? null;
  }

  /**
   * 批量 GET (I-3) — 替代 N 次 get 调用
   * @param {string[]} keys
   * @returns {Promise<(string|null)[]>} 与 keys 顺序一致
   */
  async mget(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const client = await this.getClient();
    const values = await client.mGet(keys);
    return values.map(v => v ?? null);
  }

  async del(key) {
    if (!key) {
      return false;
    }
    const client = await this.getClient();
    await client.del(key);
    return true;
  }

  // ========== Hash 操作 ==========
  async hset(key, field, value, ttlSeconds = 3600) {
    const client = await this.getClient();

    if (typeof field === 'string' && typeof value === 'string') {
      await client.hSet(key, field, value);
    } else if (Array.isArray(field) && Array.isArray(value) && field.length === value.length) {
      const fieldValuePairs = {};
      for (let i = 0; i < field.length; i++) {
        if (typeof field[i] !== 'string') {
          return false;
        }
        fieldValuePairs[field[i]] = typeof value[i] === 'string' ? value[i] : JSON.stringify(value[i]);
      }
      await client.hSet(key, fieldValuePairs);
    } else {
      return false;
    }

    if (ttlSeconds > 0) {
      await client.expire(key, ttlSeconds);
    }
    return true;
  }

  async hgetall(key) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    const data = await client.hGetAll(key);
    return Object.keys(data).length > 0 ? data : null;
  }

  async hget(key, field) {
    if (!key || !field) {
      return null;
    }
    const client = await this.getClient();
    if (Array.isArray(field)) {
      const values = await client.hmGet(key, field);
      return values.map(v => v ?? null);
    } else {
      const value = await client.hGet(key, field);
      return value ?? null;
    }
  }

  async hdel(key, field) {
    if (!key || !field || (typeof field !== 'string' && !Array.isArray(field))) {
      return false;
    }
    const client = await this.getClient();
    await client.hDel(key, field);
    return true;
  }

  // ========== 生命周期管理 ==========
  async getttl(key) {
    if (!key) {
      return -2;
    }
    const client = await this.getClient();
    return await client.ttl(key);
  }

  async expirettl(key, ttlSeconds) {
    if (!key || typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
      return false;
    }
    const client = await this.getClient();
    await client.expire(key, ttlSeconds);
    return true;
  }

  async persistttl(key) {
    if (!key) {
      return false;
    }
    const client = await this.getClient();
    await client.persist(key);
    return true;
  }

  // ========== 队列操作 (FIFO) ==========
  async enqueue(key, value) {
    if (!key || typeof value !== 'string') {
      return false;
    }
    const client = await this.getClient();
    await client.rPush(key, value);
    return true;
  }

  async dequeue(key) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lPop(key);
  }

  /**
   * 阻塞式出队 (I-2): 队列空时挂起直到有任务或超时
   * 0 表示永久阻塞 (谨慎使用), 生产环境建议 1-5s
   * @param {string} key
   * @param {number} timeoutSec 0 = 永久
   * @returns {Promise<string|null>}
   */
  async blockingDequeue(key, timeoutSec = 0) {
    if (!key) return null;
    const client = await this.getClient();
    // redis@4 的 blPop 返回 { key, element } 或 null
    const result = await client.blPop(key, timeoutSec);
    return result && result.element ? result.element : null;
  }

  async peekQueue(key) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lIndex(key, 0);
  }

  async queueLength(key) {
    if (!key) {
      return -1;
    }
    const client = await this.getClient();
    return await client.lLen(key);
  }

  // ========== 栈操作 (LIFO) ==========
  async push(key, value) {
    if (!key || typeof value !== 'string') {
      return false;
    }
    const client = await this.getClient();
    await client.lPush(key, value);
    return true;
  }

  async pop(key) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lPop(key);
  }

  async peekStack(key) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lIndex(key, 0);
  }

  async stackLength(key) {
    if (!key) {
      return -1;
    }
    const client = await this.getClient();
    return await client.lLen(key);
  }

  // ========== 通用列表操作 ==========
  async lrange(key, start = 0, stop = -1) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lRange(key, start, stop);
  }

  async lindex(key, index) {
    if (!key) {
      return null;
    }
    const client = await this.getClient();
    return await client.lIndex(key, index);
  }
}

export default new CacheManager();