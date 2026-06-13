/**
 * 租户隔离中间件
 * 从 JWT 中解析 tenantId，注入到 req 对象
 * 必须在 auth 中间件之后执行（依赖 req.user）
 */

import { verifyToken } from '../config/jwt.js';

export function tenantMiddleware(req, res, next) {
  // req.user 由 auth 中间件注入
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 401, message: 'Unauthorized' }
    });
  }

  const tenantId = req.user.tenantId;
  if (!tenantId && tenantId !== 0) {
    return res.status(403).json({
      success: false,
      error: { code: 403, message: 'Tenant ID not found in token' }
    });
  }

  req.tenantId = tenantId;
  next();
}