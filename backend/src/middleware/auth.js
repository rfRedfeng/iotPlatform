/**
 * 认证中间件
 * 验证 Authorization: Bearer <accessToken>
 * 无效/过期 → 401，有效 → 注入 req.user
 */

import { verifyToken } from '../config/jwt.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    console.warn("认证失败，缺少或无效的授权头，header:", header);
    return res.status(401).json({
      success: false,
      error: { code: 401, message: 'Missing or invalid authorization header' }
    });
  }

  const token = header.slice(7); // 去掉 "Bearer " 前缀
  const payload = verifyToken(token);

  if (!payload) {
    console.warn("认证失败，token 无效或过期");
    return res.status(401).json({
      success: false,
      error: { code: 401, message: 'Invalid or expired token' }
    });
  }
  console.log("认证成功，用户:", payload?.username, "租户ID:", payload?.tenantId);

  // payload: { userId, username, role, tenantId }
  req.user = payload;
  next();
}