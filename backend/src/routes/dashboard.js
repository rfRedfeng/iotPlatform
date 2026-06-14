/**
 * 仪表盘路由
 * GET /api/dashboard/summary  - 仪表盘摘要
 * GET /api/dashboard/trends   - 趋势数据
 */

import express from 'express';
import { getSummary, getTrends } from '../services/DashboardService.js';

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * 仪表盘摘要统计
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { areaId } = req.query;
    const result = await getSummary(req.tenantId, areaId ? parseInt(areaId) : null);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/trends
 * 设备指标趋势
 * Query: deviceId, metric, startTime, endTime, interval
 */
router.get('/trends', async (req, res, next) => {
  try {
    const { deviceId, metric, startTime, endTime, interval = '1h' } = req.query;

    if (!deviceId || !metric || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'deviceId, metric, startTime, and endTime are required' }
      });
    }

    const result = await getTrends(
      parseInt(deviceId),
      req.tenantId,
      metric,
      startTime,
      endTime,
      interval
    );
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message === 'Device not found') {
      return res.status(404).json({ success: false, error: { code: 404, message: err.message } });
    }
    next(err);
  }
});

export default router;