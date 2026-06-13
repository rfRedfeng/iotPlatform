/**
 * 设备服务
 * 包含：设备 CRUD + Cache-Aside 读模式
 * 自动生成 deviceKey / deviceSecret
 */

import crypto from 'crypto';
import DeviceRepository from '../data-access/mysql/repositories/DeviceRepository.js';
import MetricCache from '../data-processing/cache/MetricCache.js';
import DeviceCache from '../data-processing/cache/DeviceCache.js';
import TimeSeriesRepo from '../data-access/tdengine/TimeSeriesRepo.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { registerHandler } from './handlerRegistry.js';

const CACHE_TTL = 300; // 5min
const CACHE_PREFIX = 'service:device:';

// ========== 读取（Cache-Aside）==========

export async function getById(deviceId, tenantId) {
  const cacheKey = `${CACHE_PREFIX}${deviceId}`;
  const cached = await CacheManager.get(cacheKey);
  if (cached) {
    const device = JSON.parse(cached);
    // 缓存命中时校验租户
    if (device.tenantId !== tenantId) return null;
    return device;
  }

  const device = await DeviceRepository.findById(deviceId);
  if (!device) return null;

  // 租户隔离校验
  if (device.tenantId !== tenantId) return null;

  await CacheManager.set(cacheKey, JSON.stringify(device), CACHE_TTL);
  return device;
}

export async function list(tenantId, { page = 1, pageSize = 20, areaId } = {}) {
  if (areaId) {
    return await DeviceRepository.findByAreaId(tenantId, areaId, { page, pageSize });
  }
  return await DeviceRepository.findByTenantId(tenantId, { page, pageSize });
}

export async function getDeviceData(deviceId, tenantId, { page = 1, pageSize = 10 } = {}) {
  const device = await getById(deviceId, tenantId);
  if (!device) throw new Error('Device not found');

  return await TimeSeriesRepo.getLatestDeviceData(deviceId, { page, pageSize });
}

export async function getDeviceHistory(deviceId, tenantId, startTime, endTime, opts = {}) {
  const device = await getById(deviceId, tenantId);
  if (!device) throw new Error('Device not found');

  return await TimeSeriesRepo.getDeviceDataByTimeRange(deviceId, startTime, endTime, opts);
}

// ========== 写入（删除缓存，保持最终一致）==========

async function _invalidateCache(deviceId) {
  await CacheManager.del(`${CACHE_PREFIX}${deviceId}`);
}

export async function createDevice(payload, task) {
  const { name, areaId, protocol, deviceType = 'generic', tenantId } = payload;

  // 自动生成密钥
  const deviceKey = `dev_${crypto.randomBytes(8).toString('hex')}`;
  const deviceSecret = `sec_${crypto.randomBytes(24).toString('hex')}`;

  const deviceId = await DeviceRepository.insert({
    tenantId: tenantId || task.tenantId,
    areaId: areaId || null,
    name,
    deviceKey,
    deviceSecret,
    protocol,
    deviceType,
    status: 'offline'
  });

  return {
    id: deviceId,
    name,
    deviceKey,
    deviceSecret,
    protocol,
    deviceType,
    status: 'offline'
  };
}

export async function updateDevice(payload, task) {
  const { deviceId, ...updates } = payload;
  const tenantId = task.tenantId;

  const existing = await DeviceRepository.findById(deviceId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Device not found');
  }

  const result = await DeviceRepository.update(deviceId, updates);
  if (result) {
    await _invalidateCache(deviceId);
  }
  return result;
}

export async function deleteDevice(payload, task) {
  const { deviceId } = payload;
  const tenantId = task.tenantId;

  const existing = await DeviceRepository.findById(deviceId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Device not found');
  }

  const result = await DeviceRepository.delete(deviceId);
  if (result) {
    await _invalidateCache(deviceId);
    await MetricCache.deleteMetrics(deviceId);
    await DeviceCache.deleteStatus(deviceId);
  }
  return result;
}

// ========== Worker 任务处理器注册 ==========

registerHandler('device.create', createDevice);
registerHandler('device.update', updateDevice);
registerHandler('device.delete', deleteDevice);