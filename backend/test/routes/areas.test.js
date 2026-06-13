/**
 * 区域路由集成测试
 * GET/POST/PUT/DELETE /api/areas
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedArea, closePool } from '../helpers/seed.js';

const TEST_PORT = 3004;

describe('GET /api/areas', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    await seedArea(1);
    await seedArea(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 token → 200 + 区域列表', async () => {
    const res = await request(app)
      .get('/api/areas')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/areas');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/areas（异步）', () => {
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

  test('有效数据 → 202 + taskId → Worker 处理成功', async () => {
    const res = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: '测试区域', code: `TA${Date.now()}`, parentId: null });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    expect(result.data.name).toBe('测试区域');
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/areas')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Only Name' }); // 缺少 code

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/areas/:id（异步）', () => {
  let areaId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    areaId = await seedArea(1);
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
      .put(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: '更新后的区域名称' });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

describe('DELETE /api/areas/:id（异步）', () => {
  let areaId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    areaId = await seedArea(1);
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('有效删除 → 202 + taskId', async () => {
    const res = await request(app)
      .delete(`/api/areas/${areaId}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});