/**
 * 路由汇总
 * 挂载所有子路由，并应用中间件链
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';

import authRoutes from './auth.js';
import deviceRoutes from './devices.js';
import userRoutes from './users.js';
import areaRoutes from './areas.js';
import alertRoutes from './alerts.js';
import dashboardRoutes from './dashboard.js';
import tenantRoutes from './tenants.js';

const router = express.Router();

// 公开路由（无需认证）：仅 /auth/login 和 /auth/refresh 公开
// /auth/register /auth/userinfo /auth/logout 由 authRoutes 内部 authMiddleware 保护
router.use('/auth', authRoutes);

// 需要认证的路由（应用 auth → tenant → rateLimit）
const protectedRoutes = [
  { path: '/devices', router: deviceRoutes },
  { path: '/users', router: userRoutes },
  { path: '/areas', router: areaRoutes },
  { path: '/alerts', router: alertRoutes },
  { path: '/dashboard', router: dashboardRoutes },
  { path: '/tenants', router: tenantRoutes }
];

protectedRoutes.forEach(({ path, router: subRouter }) => {
  router.use(path, authMiddleware, tenantMiddleware, rateLimitMiddleware, subRouter);
});

// 404 处理
router.use(notFoundHandler);

// 错误处理（最后兜底）
router.use(errorHandler);

export default router;