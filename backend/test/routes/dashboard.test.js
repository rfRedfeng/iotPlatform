/**
 * 仪表盘路由集成测试
 * GET /api/dashboard/summary, /api/dashboard/trends
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedDevice, closePool } from '../helpers/seed.js';

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
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/dashboard/trends', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
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

  test('有效参数 → 200 + 趋势数据', async () => {
    const deviceId = await seedDevice(1);
    const res = await request(app)
      .get(`/api/dashboard/trends?deviceId=${deviceId}&metric=temperature&startTime=2024-01-01&endTime=2024-01-02`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      deviceId: expect.any(Number),
      metric: 'temperature',
      interval: expect.any(String),
      dataPoints: expect.any(Array),
    });
  });
});