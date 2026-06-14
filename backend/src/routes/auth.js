/**
 * 认证路由
 * POST /api/auth/login       - 登录（同步返回 JWT）
 * POST /api/auth/register   - 注册用户（同步,直接落库）
 * POST /api/auth/refresh    - 刷新 Token
 * GET  /api/auth/userinfo   - 当前登录用户 + 租户信息
 * POST /api/auth/logout     - 退出登录（C-1）
 */

import express from 'express';
import { login, refreshAccessToken, logout as logoutUser, registerUser } from '../services/AuthService.js';
import { getById as getTenantById } from '../services/TenantService.js';
import UserRepository from '../data-access/mysql/repositories/UserRepository.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

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
 * 同步注册：直接在路由层 bcrypt.hash 后落库（C-4）
 * 不再入 Redis 队列 — 明文密码不能进 Redis/AOF/任务结果
 * 限流 + 鉴权：当前由调用方（manager/admin）的 accessToken 保护
 */
router.post('/register', authMiddleware, async (req, res, next) => {
  try {
    const { username, password, role, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'username and password are required' }
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'password must be at least 6 characters' }
      });
    }
    // 缺省归到默认租户（1），避免 tenant_id=0 触发外键失败
    const tenantId = req.user?.tenantId ?? 1;
    const created = await registerUser(
      { username, password, role, email, tenantId },
      { tenantId, userId: req.user?.userId }
    );
    res.json({ success: true, data: created });
  } catch (err) {
    // 用户名重复等
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: 'username already exists' }
      });
    }
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
    // C-1: 过期/无效/不存在 都映射到 401
    if (err.message.includes('Invalid') || err.message.includes('not found') || err.message.includes('expired')) {
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

/**
 * POST /api/auth/logout (C-1)
 * 真登出：删除该用户的所有 refreshToken 行，让所有设备的登录态都失效
 * 前端应传 accessToken（用于鉴权），并可选地传 refreshToken 以便精准删除
 * 需要 Bearer token
 */
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const result = await logoutUser(req.user.userId, req.body?.refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;