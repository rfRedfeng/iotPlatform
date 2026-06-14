/**
 * 用户服务
 * 包含：用户 CRUD + Cache-Aside 读模式
 */

import bcrypt from 'bcrypt';
import UserRepository from '../data-access/mysql/repositories/UserRepository.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { registerHandler } from './handlerRegistry.js';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'service:user:';

const BCRYPT_ROUNDS = 12;

// ========== 读取 ==========

export async function getById(userId, tenantId) {
  const cacheKey = `${CACHE_PREFIX}${userId}`;
  const cached = await CacheManager.get(cacheKey);
  if (cached) {
    const user = JSON.parse(cached);
    if (user.tenantId !== tenantId) return null;
    return user;
  }

  const user = await UserRepository.findById(userId);
  if (!user || user.tenantId !== tenantId) return null;

  // 不返回 passwordHash
  const { passwordHash, ...safeUser } = user;
  await CacheManager.set(cacheKey, JSON.stringify(safeUser), CACHE_TTL);
  return safeUser;
}

export async function list(tenantId, { page = 1, pageSize = 20 } = {}) {
  return await UserRepository.findAllByTenantId(tenantId, { page, pageSize });
}

// 系统管理员专用:跨租户列出所有用户
export async function listAll({ page = 1, pageSize = 100 } = {}) {
  return await UserRepository.findAllAcrossTenants({ page, pageSize });
}


// ========== 写入 ==========

async function _invalidateCache(userId) {
  await CacheManager.del(`${CACHE_PREFIX}${userId}`);
}

export async function createUser(payload, task) {
  const { username, password, role = 'user', email, tenantId } = payload;

  // 加密密码
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userId = await UserRepository.insert({
    tenantId: tenantId || task.tenantId,
    username,
    passwordHash,
    role,
    email
  });

  return { id: userId, username, role, tenantId: tenantId || task.tenantId };
}

export async function updateUser(payload, task) {
  const { userId, ...updates } = payload;
  const tenantId = task.tenantId;

  const existing = await UserRepository.findById(userId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('User not found');
  }

  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
    delete updates.password;
  }

  const result = await UserRepository.update(userId, updates);
  if (result) await _invalidateCache(userId);
  return result;
}

export async function deleteUser(payload, task) {
  const { userId } = payload;
  const tenantId = task.tenantId;

  const existing = await UserRepository.findById(userId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('User not found');
  }

  const result = await UserRepository.delete(userId);
  if (result) await _invalidateCache(userId);
  return result;
}

// ========== Worker 处理器注册 ==========

registerHandler('user.create', createUser);
registerHandler('user.update', updateUser);
registerHandler('user.delete', deleteUser);