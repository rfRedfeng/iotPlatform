/**
 * 告警路由
 * GET    /api/alerts/rules            - 规则列表（同步）
 * POST   /api/alerts/rules           - 创建规则（异步 → 202）
 * GET    /api/alerts/rules/:id      - 规则详情（同步）
 * PUT    /api/alerts/rules/:id      - 更新规则（异步 → 202）
 * DELETE /api/alerts/rules/:id       - 删除规则（异步 → 202）
 * GET    /api/alerts/events          - 事件列表（同步）
 * PUT    /api/alerts/events/:id/ack - 确认事件（异步 → 202）
 */

import express from 'express';
import crypto from 'crypto';
import { listRules, getRuleById, listEvents, getEventById } from '../services/AlertService.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { TASK_QUEUE_KEY } from '../config/queue.js';

const router = express.Router();

// ========== 规则 ==========

/**
 * GET /api/alerts/rules
 */
router.get('/rules', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = await listRules(req.tenantId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/alerts/rules/:id
 */
router.get('/rules/:id', async (req, res, next) => {
  try {
    const rule = await getRuleById(parseInt(req.params.id), req.tenantId);
    if (!rule) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'Rule not found' } });
    }
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/alerts/rules
 * 创建告警规则（异步 → 202）
 */
router.post('/rules', async (req, res, next) => {
  try {
    const { name, deviceId, metric, condition, threshold, durationSeconds, enabled } = req.body;
    if (!name || !metric || !condition || threshold === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'name, metric, condition, and threshold are required' }
      });
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'alert.rule.create',
      payload: { name, deviceId, metric, condition, threshold, durationSeconds, enabled },
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
 * PUT /api/alerts/rules/:id
 * C-5: 路由层白名单过滤
 */
const ALERT_RULE_UPDATABLE_WHITELIST = ['name', 'metric', 'condition', 'threshold', 'durationSeconds', 'enabled', 'deviceId'];

router.put('/rules/:id', async (req, res, next) => {
  try {
    const ruleId = parseInt(req.params.id);
    const safeUpdates = {};
    for (const key of ALERT_RULE_UPDATABLE_WHITELIST) {
      if (key in req.body) safeUpdates[key] = req.body[key];
    }

    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'alert.rule.update',
      payload: { ruleId, ...safeUpdates },
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
 * DELETE /api/alerts/rules/:id
 */
router.delete('/rules/:id', async (req, res, next) => {
  try {
    const ruleId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'alert.rule.delete',
      payload: { ruleId },
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

// ========== 事件 ==========

/**
 * GET /api/alerts/events
 */
router.get('/events', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = await listEvents(req.tenantId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/alerts/events/:id/ack
 * 确认告警事件（异步 → 202）
 */
router.put('/events/:id/ack', async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.id);
    const taskId = crypto.randomUUID();
    const task = {
      id: taskId,
      type: 'alert.event.ack',
      payload: { eventId },
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