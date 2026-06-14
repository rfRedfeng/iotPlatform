import CacheManager from '../../data-access/redis/CacheManager.js';

class AlertCache {
  // I-9: 删除未被任何代码使用的 setAlertEvent / getAlertEvent
  // 原因: key 用 deviceId,value 存单数 ruleId,多次写会互相覆盖,且无 reader

  // 缓存告警规则
  async setRules(deviceId, rules) {
    const key = `alert:rules:${deviceId}`;
    return await CacheManager.set(key, JSON.stringify(rules), 300);
  }

  // 获取告警规则
  async getRules(deviceId) {
    const key = `alert:rules:${deviceId}`;
    const data = await CacheManager.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 缓存告警计数（用于仪表盘）
  async setAlertCount(tenantId, count) {
    const key = `alert:count:${tenantId}`;
    return await CacheManager.set(key, String(count), 60);
  }

  // 获取告警计数
  async getAlertCount(tenantId) {
    const key = `alert:count:${tenantId}`;
    const count = await CacheManager.get(key);
    return count ? parseInt(count) : 0;
  }
}

export default new AlertCache();