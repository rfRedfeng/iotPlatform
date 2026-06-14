/**
 * 区域服务
 * 包含：区域 CRUD + 树形结构查询
 */

import AreaRepository from '../data-access/mysql/repositories/AreaRepository.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { registerHandler } from './handlerRegistry.js';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'service:area:';

// ========== 读取 ==========

export async function getById(areaId, tenantId) {
  const cacheKey = `${CACHE_PREFIX}${areaId}`;
  const cached = await CacheManager.get(cacheKey);
  if (cached) {
    const area = JSON.parse(cached);
    if (area.tenantId !== tenantId) return null;
    return area;
  }

  const area = await AreaRepository.findById(areaId);
  if (!area || area.tenantId !== tenantId) return null;

  await CacheManager.set(cacheKey, JSON.stringify(area), CACHE_TTL);
  return area;
}

export async function list(tenantId, { page = 1, pageSize = 100 } = {}) {
  return await AreaRepository.findAllByTenantId(tenantId, { page, pageSize });
}

export async function getTree(tenantId) {
  // 查出所有区域，构建树形结构
  const areas = await AreaRepository.findAllByTenantId(tenantId, { page: 1, pageSize: 1000 });
  if (!areas) return [];

  const map = {};
  const roots = [];

  areas.forEach(area => {
    map[area.id] = { ...area, children: [] };
  });

  areas.forEach(area => {
    if (area.parentId === null) {
      roots.push(map[area.id]);
    } else if (map[area.parentId]) {
      map[area.parentId].children.push(map[area.id]);
    }
  });

  return roots;
}

// ========== 写入 ==========

async function _invalidateCache(areaId) {
  await CacheManager.del(`${CACHE_PREFIX}${areaId}`);
}

export async function createArea(payload, task) {
  const { name, code, description, parentId, tenantId } = payload;

  const areaId = await AreaRepository.insert({
    tenantId: tenantId || task.tenantId,
    parentId: parentId || null,
    name,
    code,
    description
  });

  // 清除父级缓存（如果存在）
  if (parentId) {
    await _invalidateCache(parentId);
  }

  return { id: areaId, name, code, parentId };
}

export async function updateArea(payload, task) {
  const { areaId, ...updates } = payload;
  const tenantId = task.tenantId;

  const existing = await AreaRepository.findById(areaId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Area not found');
  }

  const result = await AreaRepository.update(areaId, updates);
  if (result) {
    await _invalidateCache(areaId);
    if (existing.parentId) {
      await _invalidateCache(existing.parentId);
    }
  }
  return result;
}

export async function deleteArea(payload, task) {
  const { areaId } = payload;
  const tenantId = task.tenantId;

  const existing = await AreaRepository.findById(areaId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Area not found');
  }

  const result = await AreaRepository.delete(areaId);
  if (result) {
    await _invalidateCache(areaId);
    if (existing.parentId) {
      await _invalidateCache(existing.parentId);
    }
  }
  return result;
}

// ========== Worker 处理器注册 ==========

registerHandler('area.create', createArea);
registerHandler('area.update', updateArea);
registerHandler('area.delete', deleteArea);