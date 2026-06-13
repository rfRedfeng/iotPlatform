import CacheManager from '../../data-access/redis/CacheManager.js';

class DeviceCache {
  // 设置设备状态
  async setStatus(deviceId, status) {
    const key = `device:status:${deviceId}`;
    return await CacheManager.set(key, status, 300);
  }

  // 获取设备状态
  async getStatus(deviceId) {
    const key = `device:status:${deviceId}`;
    return await CacheManager.get(key);
  }

  // 删除设备状态
  async deleteStatus(deviceId) {
    const key = `device:status:${deviceId}`;
    return await CacheManager.del(key);
  }

  // 更新设备状态并记录时间
  async setStatusWithTime(deviceId, status) {
    const key = `device:status:${deviceId}`;
    const data = {
      status,
      lastSeen: new Date().toISOString()
    };
    return await CacheManager.set(key, JSON.stringify(data), 300);
  }

  // 获取设备状态（包含最后更新时间）
  async getStatusWithTime(deviceId) {
    const key = `device:status:${deviceId}`;
    const data = await CacheManager.get(key);
    return data ? JSON.parse(data) : null;
  }
}

export default new DeviceCache();