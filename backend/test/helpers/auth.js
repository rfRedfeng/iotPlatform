/**
 * 测试辅助：生成测试用 JWT token
 * 在 setup.js 设置 JWT_SECRET 后方可使用
 */
import { signAccessToken, signRefreshToken } from '../../src/config/jwt.js';

/**
 * 生成测试用 Access Token
 * @param {object} payload - { userId, username, role, tenantId }
 */
export function generateToken(payload) {
  return signAccessToken(payload);
}

/**
 * 生成测试用 Refresh Token
 */
export function generateRefreshToken(payload) {
  return signRefreshToken(payload);
}

/**
 * 生成管理员 Token（tenantId=1）
 */
export function adminToken() {
  return signAccessToken({ userId: 1, username: 'admin', role: 'admin', tenantId: 1 });
}

/**
 * 生成普通用户 Token（tenantId=1）
 */
export function userToken() {
  return signAccessToken({ userId: 2, username: 'user', role: 'user', tenantId: 1 });
}

/**
 * 生成跨租户 Token（tenantId=999）
 */
export function otherTenantToken() {
  return signAccessToken({ userId: 3, username: 'other', role: 'user', tenantId: 999 });
}