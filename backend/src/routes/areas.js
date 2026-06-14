/**
 * 区域路由
 * GET    /api/areas         - 区域列表（同步）/ 树形结构
 * POST   /api/areas        - 创建区域（异步 → 202）
 * GET    /api/areas/:id   - 区域详情（同步）
 * PUT    /api/areas/:id   - 更新区域（异步 → 202）
 * DELETE /api/areas/:id    - 删除区域（异步 → 202）
 */

import express from 'express';
import crypto from 'crypto';
import { list, getById, getTree } from '../services/AreaService.js';
import CacheManager from '../data-access/redis/CacheManager.js';

const router = express.Router();

/**
 * GET /api/areas
 * 区域列表，支持 tree=true 返回树形结构
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 100, tree } = req.query;

    if (tree === 'true') {
      const result = await getTree(req.tenantId);
      return res.json({ success: true, data: result });
    }

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
 * GET /api/areas/:id
 * 区域详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const area = await getById(parseInt(req.params.id), req.tenantId);
    if (!area) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'Area not found' } });
    }
    res.json({ success: true, data: area });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/areas
 * 创建区域（异步 → 202）
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, code, description, parentId } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'name and code are required' } });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'area.create',
      payload: { name, code, description, parentId },
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
 * PUT /api/areas/:id
 * 更新区域（异步 → 202）
 * C-5: 路由层白名单过滤 — 防止改 tenantId / createdAt
 */
const AREA_UPDATABLE_WHITELIST = ['name', 'code', 'description', 'parentId'];

router.put('/:id', async (req, res, next) => {
  try {
    const areaId = parseInt(req.params.id);
    const safeUpdates = {};
    for (const key of AREA_UPDATABLE_WHITELIST) {
      if (key in req.body) safeUpdates[key] = req.body[key];
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'area.update',
      payload: { areaId, ...safeUpdates },
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
 * DELETE /api/areas/:id
 * 删除区域（异步 → 202）
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const areaId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'area.delete',
      payload: { areaId },
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