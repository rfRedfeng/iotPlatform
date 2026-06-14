/**
 * 仪表盘路由集成测试
 * GET /api/dashboard/summary, /api/dashboard/trends
 *
 * 关注后端节点（route → service → repository）的端到端行为：
 *  - summary 通过 MySQL 聚合 + Redis 缓存
 *  - trends 通过 TDengine 拉时序数据再降采样
 *
 * TDengine 测试数据由 test/helpers/seedTdengine.js 在 describe 级 beforeAll 注入，
 * 走 REST 协议，不会引入 WebSocket 连接副作用。
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server, closeWorker } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedDevice, closePool } from '../helpers/seed.js';
import { initTdengineSchema, seedTimeSeriesData } from '../helpers/seedTdengine.js';

const TEST_PORT = 3006;

describe('GET /api/dashboard/summary', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    await seedDevice(1);
    await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 token → 200 + 摘要数据', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      totalDevices: expect.any(Number),
      onlineDevices: expect.any(Number),
      offlineDevices: expect.any(Number),
      todayAlerts: expect.any(Number),
      unacknowledgedAlerts: expect.any(Number),
      lastUpdated: expect.any(String),
    });
    // 我们 seed 了 2 台设备，summary 应正确反映
    expect(res.body.data.totalDevices).toBe(2);
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/dashboard/trends', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();

    // MySQL 建一台设备（trends 要做归属校验）
    deviceId = await seedDevice(1);

    // TDengine 建表 + 写 24 个数据点
    await initTdengineSchema();
    await seedTimeSeriesData({
      deviceId,
      tenantId: 1,
      areaId: 0,
      deviceType: 'temperature_sensor',
      hours: 24,
      metricBuilder: (h) => ({
        temperature: +(20 + Math.sin(h / 4) * 5).toFixed(2),
        humidity: +(50 + Math.cos(h / 6) * 10).toFixed(2),
      }),
    });
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('缺少必需参数 → 400', async () => {
    const res = await request(app)
      .get('/api/dashboard/trends')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('设备不存在 → 404', async () => {
    const res = await request(app)
      .get('/api/dashboard/trends?deviceId=99999&metric=temperature&startTime=2024-01-01&endTime=2024-01-02')
      .set('Authorization', `Bearer ${adminToken()}`);

    // 设备不存在时，DashboardService.getTrends 会抛出 'Device not found'
    // 路由层会捕获并返回 404
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('有效参数 → 200 + 真实趋势数据（非空）', async () => {
    // 查最近 24 小时
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const startTime = start.toISOString();
    const endTime = end.toISOString();

    const res = await request(app)
      .get(`/api/dashboard/trends?deviceId=${deviceId}&metric=temperature&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      deviceId,
      metric: 'temperature',
      interval: expect.any(String),
      dataPoints: expect.any(Array),
    });
    // 24 个点按 1h 降采样 → 应该得到非空的数据点
    expect(res.body.data.dataPoints.length).toBeGreaterThan(0);
    // 每个 dataPoint 都有 timestamp 和数值
    const dp = res.body.data.dataPoints[0];
    expect(dp).toHaveProperty('timestamp');
    expect(dp).toHaveProperty('value');
    expect(typeof dp.value).toBe('number');
  });
});

// 文件级清理
afterAll(async () => {
  await clearRedisQueue();
  await closeWorker();
});