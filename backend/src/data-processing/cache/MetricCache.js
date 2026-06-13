import CacheManager from '../../../data-access/redis/CacheManager.js';

class MetricCache {
  // 设置设备最新指标数据（metrics = { temperature: 25.6, humidity: 60 }）
  async setMetrics(deviceId, metrics) {
    const key = `device:metrics:${deviceId}`;
    return await CacheManager.set(key, JSON.stringify(metrics), 60);
  }

  // 获取设备最新指标数据
  async getMetrics(deviceId) {
    const key = `device:metrics:${deviceId}`;
    const data = await CacheManager.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 删除设备指标数据
  async deleteMetrics(deviceId) {
    const key = `device:metrics:${deviceId}`;
    return await CacheManager.del(key);
  }

  // 获取特定指标值
  async getMetric(deviceId, metricName) {
    const metrics = await this.getMetrics(deviceId);
    return metrics ? metrics[metricName] : null;
  }

  // 更新特定指标值
  async updateMetric(deviceId, metricName, value) {
    const metrics = await this.getMetrics(deviceId) || {};
    metrics[metricName] = value;
    return await this.setMetrics(deviceId, metrics);
  }

  // 批量设置指标（同时设置多个指标，JSON 格式存储）
  async setMetricsBatch(deviceId, metricsObj) {
    const key = `device:metrics:${deviceId}`;
    return await CacheManager.set(key, JSON.stringify(metricsObj), 60);
  }
}

export default new MetricCache();