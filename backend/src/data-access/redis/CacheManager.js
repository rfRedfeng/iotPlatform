import redis from 'redis';
import { redis as redisConfig } from '../../config/database.js';

class CacheManager {
  constructor() {
    this.client = null;
  }

  // 获取 Redis 客户端实例，使用单例模式确保只有一个连接
  getClient() {
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
    return this.client;
  }

  // ========== 基本方法 ==========
  // 设置缓存值，value 自动转为字符串，支持可选的过期时间（单位：秒）
  async set(key, value, ttlSeconds = 3600) {
    if (typeof key !== 'string' || key.length === 0) {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await client.set(key, stringValue);
    if (ttlSeconds > 0) {
      await client.expire(key, ttlSeconds);
    }
    return true;
  }

  // 获取缓存值，如果不存在则返回 null
  async get(key) {
    if (typeof key !== 'string' || key.length === 0) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    const value = await client.get(key);
    return value ?? null;
  }

  // 删除缓存值
  async del(key) {
    if (!key) {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.del(key);
    return true;
  }

  // ========== hash方法(对象缓存) ==========
  // 设置 hash 字段值，支持可选的过期时间（单位：秒） data 是一个对象，包含字段和值
  async hset(key, field, value, ttlSeconds = 3600) {
    const client = this.getClient();
    await client.connect();

    // 强制要求 field 和 value 都是字符串，或者都是数组
    if (typeof field != 'string' ||
      (field instanceof Array && !(value instanceof Array)) ||
      (!(field instanceof Array) && value instanceof Array)) {
      return false;
    }

    if (field instanceof Array && value instanceof Array && field.length == value.length) {
      const fieldValuePairs = {};
      for (let i = 0; i < field.length; i++) {
        if (typeof field[i] != 'string') {
          return false;
        }
        fieldValuePairs[field[i]] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      await client.hSet(key, fieldValuePairs);
    } else {
      await client.hSet(key, field, typeof value === 'string' ? value : JSON.stringify(value));
    }
    if (ttlSeconds > 0) {
      await client.expire(key, ttlSeconds);
    }
    return true;
  }

  // 获取 hash 字段值，如果不存在则返回 null
  async hgetall(key) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    const data = await client.hGetAll(key);
    return Object.keys(data).length > 0 ? data : null;
  }

  // 获取特定 hash 字段值，如果不存在则返回 null
  async hget(key, field) {
    if (!key || !field) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    if (field instanceof Array) {
      const values = await client.hmGet(key, field);
      return values.map(value => value ? value : null);
    } else {
      const value = await client.hGet(key, field);
      return value ? value : null;
    }
  }

  // 删除 hash 字段值
  async hdel(key, field) {
    if (!key || !field || (typeof field !== 'string' && !(field instanceof Array))) {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.hDel(key, field);
    return true;
  }


  // ========== 生命周期管理(TTL) ==========
  // 生命周期获取 -1 表示永久有效，-2 表示不存在，其他正整数表示剩余秒数
  async getttl(key) {
    if (!key) {
      return -2;
    }
    const client = this.getClient();
    await client.connect();
    const ttl = await client.ttl(key);
    return ttl;
  }

  // 生命周期设置，单位为秒 -1 表示永久有效，其他正整数表示过期时间
  async expirettl(key, ttlSeconds) {
    if (!key || typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.expire(key, ttlSeconds);
    return true;
  }

  async persistttl(key) {
    if (!key) {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.persist(key);
    return true;
  }

  // ========== 队列操作 (FIFO - 先进先出) ==========
  // 入队，从右进入
  async enqueue(key, value) {
    if (!key || typeof value !== 'string') {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.rPush(key, value);
    return true;
  }

  // 出队，从左出来
  async dequeue(key) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lPop(key);
  }

  // 查看队首元素
  async peekQueue(key) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lIndex(key, 0);
  }

  // 获取队列长度
  async queueLength(key) {
    if (!key) {
      return -1;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lLen(key);
  }

  // ========== 栈操作 (LIFO - 先进后出) ==========
  // 入栈，从左进入
  async push(key, value) {
    if (!key || typeof value !== 'string') {
      return false;
    }
    const client = this.getClient();
    await client.connect();
    await client.lPush(key, value);
    return true;
  }

  // 出栈，从左出来
  async pop(key) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lPop(key);
  }

  // 查看栈顶元素
  async peekStack(key) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lIndex(key, 0);
  }

  // 获取栈长度
  async stackLength(key) {
    if (!key) {
      return -1;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lLen(key);
  }

  // ========== 通用列表操作 ==========
  // 获取列表指定范围的元素
  async lrange(key, start = 0, stop = -1) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lRange(key, start, stop);
  }

  // 根据索引获取元素
  async lindex(key, index) {
    if (!key) {
      return null;
    }
    const client = this.getClient();
    await client.connect();
    return await client.lIndex(key, index);
  }
}
export default new CacheManager();