/**
 * 用户路由
 * GET    /api/users      - 用户列表（同步）
 * POST   /api/users     - 创建用户（异步 → 202）
 * GET    /api/users/:id - 用户详情（同步）
 * PUT    /api/users/:id - 更新用户（异步 → 202）
 * DELETE /api/users/:id - 删除用户（异步 → 202）
 */

import express from 'express';
import crypto from 'crypto';
import { list, getById } from '../services/UserService.js';
import CacheManager from '../data-access/redis/CacheManager.js';

const router = express.Router();

/**
 * GET /api/users
 * 用户列表（租户隔离）
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = await list(req.tenantId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 * 用户详情（同步）
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
 * POST /api/users
 * 创建用户（异步 → 202）
 */
router.post('/', async (req, res, next) => {
  try {
    const { username, password, role, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'username and password are required' } });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'user.create',
      payload: { username, password, role, email },
      tenantId: req.tenantId,
      userId: req.user.userId,
      timestamp: new Date().toISOString()
    };

    await CacheManager.enqueue('task:queue', JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/:id
 * 更新用户（异步 → 202）
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'user.update',
      payload: { userId, ...req.body },
      tenantId: req.tenantId,
      userId: req.user.userId,
      timestamp: new Date().toISOString()
    };

    await CacheManager.enqueue('task:queue', JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id
 * 删除用户（异步 → 202）
 */
router.delete('/:id', async (req, res, next) => {
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

    await CacheManager.enqueue('task:queue', JSON.stringify(task));
    res.status(202).json({ success: true, taskId });
  } catch (err) {
    next(err);
  }
});

export default router;