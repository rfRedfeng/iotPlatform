/**
 * 设备路由集成测试
 * GET/POST/PUT/DELETE /api/devices
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server, closeWorker } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedArea, seedDevice, closePool } from '../helpers/seed.js';

const TEST_PORT = 3002;

describe('GET /api/devices', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    await seedArea();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/devices');
    expect(res.status).toBe(401);
  });

  test('有效 token → 200 + 设备列表', async () => {
    const res = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('分页参数 → 200', async () => {
    const res = await request(app)
      .get('/api/devices?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/devices/:id', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    deviceId = await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('存在的设备 → 200', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(deviceId);
  });

  test('不存在的设备 → 404', async () => {
    const res = await request(app)
      .get('/api/devices/99999')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/devices（异步）', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('有效数据 → 202 + taskId', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Test Device', protocol: 'mqtt', deviceType: 'temperature_sensor' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.taskId).toBeDefined();

    // 等待 Worker 处理完成
    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    expect(result.data.name).toBe('Test Device');
    expect(result.data.deviceKey).toMatch(/^dev_/);
    expect(result.data.deviceSecret).toMatch(/^sec_/);
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Only Name' }); // 缺少 protocol

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/devices/:id（异步）', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    deviceId = await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('有效更新 → 202 + taskId', async () => {
    const res = await request(app)
      .put(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Updated Device Name' });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

// ============================================================
// C-2: TDengine 注入拦截 (路由层)
// ============================================================
describe('C-2: GET /api/devices/:id/history 注入拦截', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    deviceId = await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('startTime 含 SQL 注入 → 400', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}/history?startTime=2024-01-01'%3B%20DROP%20TABLE%20d1%3B--&endTime=2024-12-31T23:59:59Z`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid startTime|ISO 8601/);
  });

  test('endTime 不是 ISO 8601 → 400', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}/history?startTime=2024-01-01T00:00:00Z&endTime=not-a-date`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  test('endTime 在未来 → 400', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}/history?startTime=2020-01-01T00:00:00Z&endTime=2099-01-01T00:00:00Z`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/future/);
  });

  test('时间跨度 > 30 天 → 400', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}/history?startTime=2020-01-01T00:00:00Z&endTime=2020-06-01T00:00:00Z`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/30 days/);
  });

  test('endTime <= startTime → 400', async () => {
    const res = await request(app)
      .get(`/api/devices/${deviceId}/history?startTime=2024-06-01T00:00:00Z&endTime=2024-01-01T00:00:00Z`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/after/);
  });
});

describe('DELETE /api/devices/:id（异步）', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    deviceId = await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('存在的设备 → 202 + taskId', async () => {
    const res = await request(app)
      .delete(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

// ============================================================
// C-5: PUT 字段过滤 — 防止改 tenantId / deviceKey / deviceSecret
// ============================================================
describe('C-5: PUT /api/devices/:id 字段过滤', () => {
  let deviceId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    deviceId = await seedDevice(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('尝试改 tenantId/deviceKey/deviceSecret → 仅合法字段入队,敏感字段被丢', async () => {
    const res = await request(app)
      .put(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'New Name',
        tenantId: 999,           // 应被丢
        deviceKey: 'hacked_key', // 应被丢
        deviceSecret: 'hacked',  // 应被丢
        lastSeen: new Date().toISOString(), // 应被丢
      });

    expect(res.status).toBe(202);
    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    // 验证: 修改后设备 tenantId 仍为 1,deviceKey 未被改
    const { default: DeviceRep } = await import('../../src/data-access/mysql/repositories/DeviceRepository.js');
    const updated = await DeviceRep.findById(deviceId);
    expect(updated.tenantId).toBe(1);
    expect(updated.deviceKey).not.toBe('hacked_key');
  });
});

// 文件级清理
afterAll(async () => {
  await clearRedisQueue();
  await closeWorker();
});
