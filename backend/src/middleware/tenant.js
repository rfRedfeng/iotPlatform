/**
 * 租户隔离中间件
 * 从 JWT 中解析 tenantId，注入到 req 对象
 * 必须在 auth 中间件之后执行（依赖 req.user）
 *
 * admin 用户可通过 ?tenantId=X 查询参数切换查看的租户数据
 * 非 admin 用户忽略该参数，始终使用自己 JWT 中的 tenantId
 *
 * I-1: 集中 ROLES 枚举,role 必须在白名单内
 */

import { verifyToken } from '../config/jwt.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
});

export function tenantMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: { code: 401, message: 'Unauthorized' }
        });
    }

    // I-1: 校验 role 必须在白名单内,防止 DB 里有非法 role
    if (!Object.values(ROLES).includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: { code: 403, message: 'Invalid role' }
        });
    }

    const jwtTenantId = req.user.tenantId;
    if (jwtTenantId === undefined || jwtTenantId === null) {
        return res.status(403).json({
            success: false,
            error: { code: 403, message: 'Tenant ID not found in token' }
        });
    }

    // admin 可通过 ?tenantId=X 切换查看的租户
    const query = req.query || {};
    if (req.user.role === ROLES.ADMIN && query.tenantId) {
        const override = parseInt(query.tenantId);
        if (!isNaN(override)) {
            req.tenantId = override;
            return next();
        }
    }

    req.tenantId = jwtTenantId;
    next();
}
