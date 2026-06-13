/**
 * 仪表盘服务
 * 包含：摘要统计 + 趋势数据
 */

import DeviceRepository from '../data-access/mysql/repositories/DeviceRepository.js';
import AlertEventRepository from '../data-access/mysql/repositories/AlertEventRepository.js';
import DeviceCache from '../data-processing/cache/DeviceCache.js';
import MetricCache from '../data-processing/cache/MetricCache.js';
import AlertCache from '../data-processing/cache/AlertCache.js';
import TimeSeriesRepo from '../data-access/tdengine/TimeSeriesRepo.js';

/**
 * 获取仪表盘摘要
 * @returns {Promise<{totalDevices, onlineDevices, offlineDevices, todayAlerts, unacknowledgedAlerts}>}
 */
export async function getSummary(tenantId) {
  // 设备统计
  const allDevices = await DeviceRepository.findByTenantId(tenantId, { page: 1, pageSize: 10000 });
  const totalDevices = allDevices?.length || 0;

  let onlineDevices = 0;
  for (const device of allDevices || []) {
    const status = await DeviceCache.getStatus(device.id);
    if (status === 'online') onlineDevices++;
  }

  const offlineDevices = totalDevices - onlineDevices;

  // 告警统计（今日 + 未确认）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const allEvents = await AlertEventRepository.findByTenantId(tenantId, { page: 1, pageSize: 1000 });
  const todayAlerts = (allEvents || []).filter(e => new Date(e.triggered_at) >= todayStart).length;
  const unacknowledgedAlerts = (allEvents || []).filter(e => !e.acknowledged).length;

  // 从 Redis 获取实时告警计数
  const alertCount = await AlertCache.getAlertCount(tenantId);

  return {
    totalDevices,
    onlineDevices,
    offlineDevices,
    todayAlerts,
    unacknowledgedAlerts,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 获取设备指标趋势数据
 */
export async function getTrends(deviceId, tenantId, metric, startTime, endTime, interval = '1h') {
  // 校验设备归属
  const device = await DeviceRepository.findById(deviceId);
  if (!device || device.tenantId !== tenantId) {
    throw new Error('Device not found');
  }

  // 从 TDengine 查询原始数据
  const rawData = await TimeSeriesRepo.getDeviceDataByTimeRange(deviceId, startTime, endTime, { pageSize: 1000 });

  if (!rawData || !Array.isArray(rawData)) {
    return { deviceId, metric, interval, dataPoints: [] };
  }

  // 按 interval 降采样（简单平均）
  const intervalMs = _intervalToMs(interval);
  const buckets = {};

  for (const row of rawData) {
    const ts = new Date(row.ts).getTime();
    const bucketKey = Math.floor(ts / intervalMs) * intervalMs;
    if (!buckets[bucketKey]) buckets[bucketKey] = { sum: 0, count: 0 };
    // 尝试从 metrics JSON 中提取指标值
    let value;
    try {
      const metrics = typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics;
      value = metrics[metric];
    } catch {
      continue;
    }
    if (typeof value === 'number') {
      buckets[bucketKey].sum += value;
      buckets[bucketKey].count++;
    }
  }

  const dataPoints = Object.entries(buckets)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([ts, bucket]) => ({
      timestamp: new Date(parseInt(ts)).toISOString(),
      value: bucket.sum / bucket.count
    }));

  return { deviceId, metric, interval, dataPoints };
}

function _intervalToMs(interval) {
  const map = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
  return map[interval] || 3600000;
}