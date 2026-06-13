/**
 * 告警路由集成测试
 * GET/POST/PUT/DELETE /api/alerts/rules, /api/alerts/events
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import {
  cleanupTables, seedTenant, seedArea, seedDevice, closePool
} from '../helpers/seed.js';

const TEST_PORT = 3005;

describe('GET /api/alerts/rules', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 token → 200 + 规则列表', async () => {
    const res = await request(app)
      .get('/api/alerts/rules')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/alerts/rules');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/alerts/rules（异步）', () => {
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
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: '温度过高告警',
        metric: 'temperature',
        condition: 'gt',
        threshold: 35.0,
        durationSeconds: 0,
        enabled: true,
      });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    expect(result.data.metric).toBe('temperature');
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Only Name' }); // 缺少 metric, condition, threshold

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/alerts/rules/:id（异步）', () => {
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
    // 先创建一个规则
    const createRes = await request(app)
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Temp Rule',
        metric: 'temperature',
        condition: 'gt',
        threshold: 30.0,
      });

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const createResult = await waitForTaskResult(createRes.body.taskId, 5000);
    const ruleId = createResult.data.id;

    const res = await request(app)
      .put(`/api/alerts/rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ threshold: 40.0, enabled: false });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

describe('DELETE /api/alerts/rules/:id（异步）', () => {
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

  test('有效删除 → 202 + taskId', async () => {
    // 先创建一个规则
    const createRes = await request(app)
      .post('/api/alerts/rules')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'To Delete',
        metric: 'temperature',
        condition: 'gt',
        threshold: 30.0,
      });

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const createResult = await waitForTaskResult(createRes.body.taskId, 5000);
    const ruleId = createResult.data.id;

    const res = await request(app)
      .delete(`/api/alerts/rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

describe('GET /api/alerts/events', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 token → 200 + 事件列表', async () => {
    const res = await request(app)
      .get('/api/alerts/events')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PUT /api/alerts/events/:id/ack（异步）', () => {
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

  test('确认事件 → 202 + taskId', async () => {
    // 注意：需要在 DB 中有实际的 alert_event 才能测试确认
    // 这里测试端点可用性，实际数据需要通过设备数据触发告警
    const res = await request(app)
      .put('/api/alerts/events/99999/ack')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    // 因为没有实际事件，这里会返回 202（任务入队）而不是 404
    // Worker 处理时会因为找不到事件而返回 failed
    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();
  });
});