/**
 * 认证路由
 * POST /api/auth/login       - 登录（同步返回 JWT）
 * POST /api/auth/register   - 注册用户（异步队列）
 * POST /api/auth/refresh    - 刷新 Token
 * GET  /api/auth/me         - 当前登录用户 + 租户信息
 */

import express from 'express';
import crypto from 'crypto';
import { login, refreshAccessToken } from '../services/AuthService.js';
import { getById as getTenantById } from '../services/TenantService.js';
import UserRepository from '../data-access/mysql/repositories/UserRepository.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const RESULT_TTL = 300;

/**
 * POST /api/auth/login
 * 同步登录，验证密码后返回 JWT
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'username and password are required' }
      });
    }

    const result = await login(username, password);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === '用户名或密码错误') {
      return res.status(401).json({ success: false, error: { code: 401, message: err.message } });
    }
    next(err);
  }
});

/**
 * POST /api/auth/register
 * 异步注册，写入 task:queue 后立即返回 202
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, role, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'username and password are required' }
      });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'auth.register',
      payload: { username, password, role, email },
      // 缺省归到默认租户（1），避免 tenant_id=0 触发外键失败
      tenantId: req.user?.tenantId ?? 1,
      userId: req.user?.userId,
      timestamp: new Date().toISOString()
    };

    await CacheManager.enqueue('task:queue', JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * 用 refreshToken 换取新的 accessToken
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'refreshToken is required' }
      });
    }

    const result = await refreshAccessToken(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message.includes('Invalid') || err.message.includes('not found')) {
      return res.status(401).json({ success: false, error: { code: 401, message: err.message } });
    }
    next(err);
  }
});

/**
 * GET /api/auth/userinfo
 * 返回当前登录用户的完整信息 + 所属租户信息
 * 需要 Bearer token
 */
router.get('/userinfo', authMiddleware, async (req, res, next) => {
  try {
    const user = await UserRepository.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'User not found' } });
    }
    // 剥掉密码哈希再返回
    const { passwordHash, ...safeUser } = user;

    const tenant = await getTenantById(req.user.tenantId);

    res.json({ success: true, data: { user: safeUser, tenant } });
  } catch (err) {
    next(err);
  }
});

export default router;