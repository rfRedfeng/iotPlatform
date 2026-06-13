/**
 * 租户服务
 * 包含：租户 CRUD + 配额检查
 */

import TenantRepository from '../data-access/mysql/repositories/TenantRepository.js';
import DeviceRepository from '../data-access/mysql/repositories/DeviceRepository.js';
import UserRepository from '../data-access/mysql/repositories/UserRepository.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { registerHandler } from './handlerRegistry.js';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'service:tenant:';

// ========== 读取 ==========

export async function getById(tenantId) {
  const cacheKey = `${CACHE_PREFIX}${tenantId}`;
  const cached = await CacheManager.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const tenant = await TenantRepository.findById(tenantId);
  if (tenant) {
    await CacheManager.set(cacheKey, JSON.stringify(tenant), CACHE_TTL);
  }
  return tenant;
}

/**
 * 检查租户配额（设备数、用户数）
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkQuota(tenantId, resourceType) {
  const tenant = await getById(tenantId);
  if (!tenant) return { allowed: false, reason: 'Tenant not found' };

  if (resourceType === 'device') {
    const devices = await DeviceRepository.findByTenantId(tenantId, { page: 1, pageSize: 1 });
    const total = devices?.length || 0;
    if (total >= tenant.maxDevices) {
      return { allowed: false, reason: `Device quota exceeded (max: ${tenant.maxDevices})` };
    }
  }

  if (resourceType === 'user') {
    const users = await UserRepository.findAllByTenantId(tenantId, { page: 1, pageSize: 1 });
    const total = users?.length || 0;
    if (total >= tenant.maxUsers) {
      return { allowed: false, reason: `User quota exceeded (max: ${tenant.maxUsers})` };
    }
  }

  return { allowed: true };
}

// ========== 写入 ==========

async function _invalidateCache(tenantId) {
  await CacheManager.del(`${CACHE_PREFIX}${tenantId}`);
}

export async function createTenant(payload, task) {
  const { name, maxDevices = 100, maxUsers = 20 } = payload;

  const tenantId = await TenantRepository.create({
    name,
    status: 'active',
    maxDevices,
    maxUsers
  });

  return { id: tenantId, name, maxDevices, maxUsers };
}

export async function updateTenant(tenantId, payload, task) {
  const existing = await TenantRepository.findById(tenantId);
  if (!existing) {
    throw new Error('Tenant not found');
  }

  const result = await TenantRepository.update(tenantId, payload);
  if (result) await _invalidateCache(tenantId);
  return result;
}

// ========== Worker 处理器注册 ==========

registerHandler('tenant.create', createTenant);
registerHandler('tenant.update', updateTenant);