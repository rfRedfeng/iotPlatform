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
import { assertIntegerId, assertIsoTimestamp } from '../utils/sqlSanitizer.js';

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
 *
 * 安全防护 (C-2 + I-4 + I-11):
 * - startTime/endTime 必须合法 ISO 8601
 * - endTime <= now() 且 endTime > startTime
 * - 时间跨度 <= 30 天 (防拉全表)
 * - 上述校验在路由层先做一次,service/Repo 层会再做一次 (纵深防御)
 */
router.get('/:id/history', async (req, res, next) => {
  try {
    const { startTime, endTime, page = 1, pageSize = 100 } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'startTime and endTime are required' } });
    }
    // 白名单校验 - 必须在传进 service 之前拒掉
    assertIntegerId(req.params.id, 'id');
    const _start = assertIsoTimestamp(startTime, 'startTime');
    const _end = assertIsoTimestamp(endTime, 'endTime');
    const startMs = new Date(_start).getTime();
    const endMs = new Date(_end).getTime();
    if (endMs <= startMs) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'endTime must be after startTime' } });
    }
    if (endMs > Date.now()) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'endTime cannot be in the future' } });
    }
    const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    if (endMs - startMs > MAX_WINDOW_MS) {
      return res.status(400).json({ success: false, error: { code: 400, message: 'time window cannot exceed 30 days' } });
    }

    const data = await getDeviceHistory(
      parseInt(req.params.id),
      req.tenantId,
      _start,
      _end,
      { page: parseInt(page), pageSize: parseInt(pageSize) }
    );
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) {
      // AppError → 直接返回
      return res.status(err.statusCode).json({ success: false, error: { code: err.statusCode, message: err.message } });
    }
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
 *
 * C-5: 路由层白名单过滤 — 防止客户端修改 tenantId / deviceKey / deviceSecret / lastSeen
 * 即使 Device.updatableFields 没列入这些字段,显式拒绝更安全
 */
const DEVICE_UPDATABLE_WHITELIST = ['name', 'areaId', 'protocol', 'deviceType', 'status', 'metadata'];

router.put('/:id', async (req, res, next) => {
  try {
    const deviceId = parseInt(req.params.id);
    // C-5: 严格白名单,只放行可改字段
    const safeUpdates = {};
    for (const key of DEVICE_UPDATABLE_WHITELIST) {
      if (key in req.body) safeUpdates[key] = req.body[key];
    }
    const blocked = Object.keys(req.body).filter(k => !DEVICE_UPDATABLE_WHITELIST.includes(k));
    if (blocked.length > 0) {
      console.warn(`[devices] PUT /:id blocked fields: ${blocked.join(',')}`);
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'device.update',
      payload: { deviceId, ...safeUpdates },
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