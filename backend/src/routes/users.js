/**
 * 用户路由
 * GET    /api/users      - 用户列表（系统管理员返回全部,其它仅本租户）
 * POST   /api/users     - 创建用户（仅系统管理员）
 * GET    /api/users/:id - 用户详情
 * PUT    /api/users/:id - 更新用户（系统管理员:任意;自己:仅密码;其它:403）
 * DELETE /api/users/:id - 删除用户（仅系统管理员）
 *
 * 权限规则:
 *   - admin (系统管理员): 全部操作 + 任意用户的任意字段
 *   - manager/user: 只能改自己的 password,其它请求 403
 */

import express from 'express';
import crypto from 'crypto';
import { list, listAll, getById, createUser } from '../services/UserService.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { TASK_QUEUE_KEY } from '../config/queue.js';

const router = express.Router();

/** admin 角色判断 */
function isAdmin(user) {
    return user?.role === 'admin';
}

/**
 * GET /api/users
 * 系统管理员:返回所有用户（跨租户）
 * 其他:仅返回本租户且 role='user' 的用户（看不到 admin/manager）
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 50 } = req.query;
    const opts = { page: parseInt(page), pageSize: parseInt(pageSize) };
    let result = isAdmin(req.user)
      ? await listAll(opts)
      : await list(req.tenantId, opts);

    // 非管理员: 进一步过滤掉 admin/manager,只留 role='user'
    if (!isAdmin(req.user)) {
      const arr = Array.isArray(result) ? result : (result?.list || []);
      const filtered = arr.filter(u => u.role === 'user');
      result = Array.isArray(result) ? filtered : { ...result, list: filtered };
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await getById(parseInt(req.params.id), req.tenantId);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'User not found' } });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users - 仅系统管理员
 * 同步创建 (C-4): 直接在路由层 bcrypt.hash 后落库,密码不进 Redis 队列
 */
router.post('/', async (req, res, next) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      error: { code: 403, message: '仅系统管理员可创建用户' }
    });
  }
  try {
    const { username, password, role, email, tenantId } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'username and password are required' } });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'password must be at least 6 characters' } });
    }
    // 管理员必须指定租户(admin 自身的 tenantId=0 不能作为默认值)
    if (!tenantId && tenantId !== 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: '管理员创建用户必须指定 tenantId' } });
    }

    // C-4: 同步注册,不走队列 — 防止明文密码进 Redis
    const created = await createUser({
      username,
      password,
      role: role || 'user',
      email,
      tenantId,
    });
    res.json({ success: true, data: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(409).json({ success: false, error: { code: 409, message: 'username already exists' } });
    }
    next(err);
  }
});

/**
 * PUT /api/users/:id
 *  - admin:   任意用户,可改 username/email/password/role/tenantId (5 个字段)
 *  - 自己:    username/email/password（不含 role/tenantId）
 *  - manager: 本租户其他用户,可改 username/email/password（不含 role/tenantId）
 *  - user:    改其他用户 → 403
 *
 * C-5: 显式白名单过滤。即使 User.updatableFields 含 tenantId,
 * 路由层也要先过滤,避免依赖 repo 层的字段过滤。
 */
const ADMIN_ALLOWED = ['username', 'email', 'password', 'role', 'tenantId'];

router.put('/:id', async (req, res, next) => {
  const targetId = parseInt(req.params.id);
  const isSelf = targetId === req.user.userId;
  const role = req.user.role;
  const admin = role === 'admin';
  const manager = role === 'manager';

  if (admin) {
    // C-5: 限制 admin 只能改这 5 个字段,不允许改 passwordHash / createdAt 等
    const filtered = {};
    for (const key of ADMIN_ALLOWED) {
      if (key in req.body) filtered[key] = req.body[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({
        success: false, error: { code: 400, message: '至少提供一个可修改字段' }
      });
    }
    req.body = filtered;
  } else if (isSelf) {
    // 自己:username/email/password（不含 role/tenantId）
    const allowed = ['username', 'email', 'password'];
    const filtered = {};
    for (const key of allowed) {
      if (key in req.body) filtered[key] = req.body[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({
        success: false, error: { code: 400, message: '至少提供一个可修改字段' }
      });
    }
    req.body = filtered;
  } else if (manager) {
    // manager 改本租户其他用户：必须 target 是 role='user'，且不能改 role
    const { getById } = await import('../services/UserService.js');
    const target = await getById(targetId, req.tenantId);
    if (!target) {
      return res.status(404).json({
        success: false, error: { code: 404, message: 'User not found in your tenant' }
      });
    }
    if (target.role !== 'user') {
      return res.status(403).json({
        success: false, error: { code: 403, message: '租户管理员只能编辑 role=user 的用户' }
      });
    }
    // 过滤字段：username/email/password（不含 role、不含 tenantId）
    const allowed = ['password', 'username', 'email'];
    const filtered = {};
    for (const key of allowed) {
      if (key in req.body) filtered[key] = req.body[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({
        success: false, error: { code: 400, message: '至少提供一个可修改字段' }
      });
    }
    req.body = filtered;
  } else {
    return res.status(403).json({
      success: false,
      error: { code: 403, message: '无权修改其他用户' }
    });
  }

  try {
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'user.update',
      payload: { userId: targetId, ...req.body },
      tenantId: req.tenantId,
      userId: req.user.userId,
      timestamp: new Date().toISOString()
    };

    await CacheManager.enqueue(TASK_QUEUE_KEY, JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id - 仅系统管理员
 */
router.delete('/:id', async (req, res, next) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      error: { code: 403, message: '仅系统管理员可删除用户' }
    });
  }
  try {
    const userId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'user.delete',
      payload: { userId },
      tenantId: req.tenantId,
      userId: req.user.userId,
      timestamp: new Date().toISOString()
    };

    await CacheManager.enqueue(TASK_QUEUE_KEY, JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

export default router;