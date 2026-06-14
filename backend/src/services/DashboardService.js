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
import CacheManager from '../data-access/redis/CacheManager.js';

/**
 * 获取仪表盘摘要
 * @param {number} tenantId
 * @param {number|null} areaId 区域过滤(null = 全部区域)
 * @returns {Promise<{totalDevices, onlineDevices, offlineDevices, todayAlerts, unacknowledgedAlerts, areaId, lastUpdated}>}
 */
export async function getSummary(tenantId, areaId = null) {
  // 设备统计（按区域过滤）
  let allDevices;
  if (areaId) {
      allDevices = await DeviceRepository.findByAreaId(tenantId, areaId, { page: 1, pageSize: 10000 });
  } else {
      allDevices = await DeviceRepository.findByTenantId(tenantId, { page: 1, pageSize: 10000 });
  }
  const totalDevices = allDevices?.length || 0;

  // I-3: 用 MGET 批量拿设备状态,避免 N 次 Redis 往返
  const statusKeys = (allDevices || []).map(d => `device:status:${d.id}`);
  const statuses = statusKeys.length > 0 ? await CacheManager.mget(statusKeys) : [];
  let onlineDevices = 0;
  for (const status of statuses) {
    if (status === 'online') onlineDevices++;
  }

  const offlineDevices = totalDevices - onlineDevices;

  // 告警统计（今日 + 未确认）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const allEvents = await AlertEventRepository.findByTenantId(tenantId, { page: 1, pageSize: 1000 });
  const todayAlerts = (allEvents || []).filter(e => new Date(e.triggeredAt) >= todayStart).length;
  const unacknowledgedAlerts = (allEvents || []).filter(e => !e.acknowledged).length;

  // 从 Redis 获取实时告警计数
  const alertCount = await AlertCache.getAlertCount(tenantId);

  return {
    totalDevices,
    onlineDevices,
    offlineDevices,
    todayAlerts,
    unacknowledgedAlerts,
    areaId: areaId || null,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 获取设备指标趋势数据
 * I-5: 用 TDengine INTERVAL 时间分桶 + JS 侧 metric 解析与平均
 */
export async function getTrends(deviceId, tenantId, metric, startTime, endTime, interval = '1h') {
  // 校验设备归属
  const device = await DeviceRepository.findById(deviceId);
  if (!device || device.tenantId !== tenantId) {
    throw new Error('Device not found');
  }

  const intervalMs = _intervalToMs(interval);
  const raw = await TimeSeriesRepo.getDeviceDataAggregated(
    deviceId, metric, startTime, endTime, intervalMs
  );

  if (!raw || !Array.isArray(raw)) {
    return { deviceId, metric, interval, dataPoints: [] };
  }

  const dataPoints = raw.map((row) => ({
    timestamp: typeof row.ts === 'string' ? row.ts : new Date(row.ts).toISOString(),
    value: row.value,
  }));

  return { deviceId, metric, interval, dataPoints };

  return { deviceId, metric, interval, dataPoints };
}

function _intervalToMs(interval) {
  const map = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
  return map[interval] || 3600000;
}