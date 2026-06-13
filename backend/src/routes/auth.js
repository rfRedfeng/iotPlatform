/**
 * 认证路由
 * POST /api/auth/login       - 登录（同步返回 JWT）
 * POST /api/auth/register   - 注册用户（异步队列）
 * POST /api/auth/refresh    - 刷新 Token
 */

import express from 'express';
import crypto from 'crypto';
import { login, refreshAccessToken } from '../services/AuthService.js';
import CacheManager from '../data-access/redis/CacheManager.js';

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
      tenantId: req.user?.tenantId ?? 0,
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

export default router;