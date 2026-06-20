/**
 * 认证服务
 * 包含：登录、注册、刷新 Token
 * 采用 bcrypt 密码验证，JWT 签发
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import UserRepository from '../data-access/mysql/repositories/UserRepository.js';
import RefreshTokenRepository from '../data-access/mysql/repositories/RefreshTokenRepository.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../config/jwt.js';
import { registerHandler } from './handlerRegistry.js';

const BCRYPT_ROUNDS = 12;

// ========== 同步方法（供 Route 直接调用）==========

/**
 * 用户登录
 * @returns {Promise<{accessToken, refreshToken, user}>}
 */
export async function login(username, password) {
  const user = await UserRepository.findByUsername(username);
  if (!user) {
    throw new Error('用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('用户名或密码错误');
  }

  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // 存储 refreshToken 到数据库
  await RefreshTokenRepository.create({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  console.log(`[AuthService] 用户 ${username} 登录成功，签发 accessToken 和 refreshToken`);

  return {
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId
    }
  };
}

/**
 * 注册新用户（manager/admin 可调用）
 * 由 Worker 异步处理
 */
export async function registerUser(payload, task) {
  const { username, password, role = 'user', email, tenantId } = payload;

  // 密码加密
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userId = await UserRepository.insert({
    tenantId: tenantId || task.tenantId,
    username,
    passwordHash,
    role,
    email
  });

  return {
    id: userId,
    username,
    role,
    tenantId: tenantId || task.tenantId
  };
}

/**
 * 验证 refreshToken 并返回 payload（不签发新 token）
 * 用于 WebSocket upgrade 鉴权
 * @returns {object|null} payload {userId, username, role, tenantId} 或 null
 */
export async function verifyRefreshToken(refreshToken) {
  if (!refreshToken) return null;
  const payload = verifyToken(refreshToken);
  if (!payload) return null;
  const stored = await RefreshTokenRepository.findByToken(refreshToken);
  if (!stored) return null;
  if (!_isRefreshTokenLive(stored)) return null;
  return {
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
    tenantId: payload.tenantId,
  };
}

/**
 * 校验 refreshToken 记录是否还在有效期内
 * @param {object} stored 来自 findByToken 的行 (camelCase,expiresAt 字段)
 * @returns {boolean}
 */
function _isRefreshTokenLive(stored) {
  if (!stored || !stored.expiresAt) return false;
  const exp = stored.expiresAt instanceof Date
    ? stored.expiresAt.getTime()
    : new Date(stored.expiresAt).getTime();
  return Number.isFinite(exp) && exp > Date.now();
}

/**
 * 刷新 Access Token
 * 规则：refreshToken 剩余有效期 < 1 天时，旋转（删除旧+签发新）
 */
export async function refreshAccessToken(refreshToken) {
  // 验证 refreshToken 有效性
  const payload = verifyToken(refreshToken);
  if (!payload) {
    throw new Error('Invalid or expired refresh token');
  }

  const stored = await RefreshTokenRepository.findByToken(refreshToken);
  if (!stored) {
    throw new Error('Refresh token not found');
  }
  if (!_isRefreshTokenLive(stored)) {
    await RefreshTokenRepository.deleteByToken(refreshToken);
    throw new Error('Refresh token expired');
  }

  // 计算 refreshToken 剩余有效期（秒）
  const now = Math.floor(Date.now() / 1000);
  const remaining = (payload.exp || 0) - now;
  const ONE_DAY = 24 * 60 * 60;

  let newRefreshToken = refreshToken;

  // 剩余不足 1 天，旋转 refreshToken
  if (remaining < ONE_DAY) {
    // 删除旧 token
    await RefreshTokenRepository.deleteByToken(refreshToken);

    // 签发新 refreshToken
    newRefreshToken = signRefreshToken({
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      tenantId: payload.tenantId
    });

    // 存储新 refreshToken
    await RefreshTokenRepository.create({
      userId: payload.userId,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }

  // 签发新 Access Token
  const newPayload = {
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
    tenantId: payload.tenantId
  };

  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: newRefreshToken,
    expiresIn: 900
  };
}

// ========== Worker 任务处理器（自动注册）==========

registerHandler('auth.register', registerUser);

/**
 * 退出登录：删除该用户的所有 refreshToken，让所有设备重新登录
 * @param {number} userId
 * @param {string} [refreshToken] 可选 - 如果传了就只删这一条（精准登出当前会话）
 * @returns {Promise<{deleted: number}>}
 */
export async function logout(userId, refreshToken) {
  if (refreshToken) {
    const ok = await RefreshTokenRepository.deleteByToken(refreshToken);
    return { deleted: ok ? 1 : 0 };
  }
  const n = await RefreshTokenRepository.deleteAllForUser(userId);
  return { deleted: n };
}

// ========== 生成随机设备密钥 ==========
// Key:  dev_ + 16字节hex = 固定 36 字符
// Secret: sec_ + 32字节hex = 固定 68 字符

const KEY_BYTES = 16;   // → 32 hex chars
const SECRET_BYTES = 32; // → 64 hex chars

export function generateDeviceCredentials() {
  return {
    deviceKey: `dev_${crypto.randomBytes(KEY_BYTES).toString('hex')}`,
    deviceSecret: `sec_${crypto.randomBytes(SECRET_BYTES).toString('hex')}`
  };
}

// 确保已存在的 key/secret 也是固定长度(供升级迁移用)
export function normalizeDeviceKey(key) {
  if (!key || typeof key !== 'string') return key;
  // 如果长度不对(旧数据),返回原值
  return key;
}
export function normalizeDeviceSecret(sec) {
  if (!sec || typeof sec !== 'string') return sec;
  return sec;
}