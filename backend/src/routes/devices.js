/**
 * 设备路由
 * GET  /api/devices          - 设备列表（同步）
 * POST /api/devices          - 创建设备（异步队列 → 202）
 * GET  /api/devices/:id      - 设备详情（同步）
 * GET  /api/devices/:id/data - 设备数据（同步）
 * PUT  /api/devices/:id      - 更新设备（异步队列 → 202）
 * DELETE /api/devices/:id    - 删除设备（异步队列 → 202）
 */

import express from 'express';
import crypto from 'crypto';
import { list, getById, getDeviceData, getDeviceHistory } from '../services/DeviceService.js';
import CacheManager from '../data-access/redis/CacheManager.js';

const router = express.Router();

/**
 * GET /api/devices
 * 设备列表（同步，含租户隔离）
 */
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, areaId } = req.query;
    const result = await list(req.tenantId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      areaId: areaId ? parseInt(areaId) : undefined
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/devices/:id
 * 设备详情（同步）
 */
router.get('/:id', async (req, res, next) => {
  try {
    const device = await getById(parseInt(req.params.id), req.tenantId);
    if (!device) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'Device not found' } });
    }
    res.json({ success: true, data: device });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/devices/:id/data
 * 设备时序数据（同步）
 */
router.get('/:id/data', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const data = await getDeviceData(parseInt(req.params.id), req.tenantId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Device not found') {
      return res.status(404).json({ success: false, error: { code: 404, message: err.message } });
    }
    next(err);
  }
});

/**
 * GET /api/devices/:id/history
 * 设备历史数据（同步）
 */
router.get('/:id/history', async (req, res, next) => {
  try {
    const { startTime, endTime, page = 1, pageSize = 100 } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'startTime and endTime are required' } });
    }
    const data = await getDeviceHistory(
      parseInt(req.params.id),
      req.tenantId,
      startTime,
      endTime,
      { page: parseInt(page), pageSize: parseInt(pageSize) }
    );
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Device not found') {
      return res.status(404).json({ success: false, error: { code: 404, message: err.message } });
    }
    next(err);
  }
});

/**
 * POST /api/devices
 * 创建设备（异步队列 → 202）
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, areaId, protocol, deviceType } = req.body;
    if (!name || !protocol) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'name and protocol are required' } });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'device.create',
      payload: { name, areaId, protocol, deviceType },
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
 * PUT /api/devices/:id
 * 更新设备（异步队列 → 202）
 */
router.put('/:id', async (req, res, next) => {
  try {
    const deviceId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'device.update',
      payload: { deviceId, ...req.body },
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
 * POST /api/devices/:id/regenerate-secret
 * 重新生成 deviceSecret（异步队列 → 202）
 */
router.post('/:id/regenerate-secret', async (req, res, next) => {
  try {
    const deviceId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'device.regenerate-secret',
      payload: { deviceId },
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
 * DELETE /api/devices/:id
 * 删除设备（异步队列 → 202）
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deviceId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'device.delete',
      payload: { deviceId },
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