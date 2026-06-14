/**
 * 用户路由集成测试
 * GET/POST/PUT/DELETE /api/users
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server, closeWorker } from '../test-server.js';
import { adminToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedUser, closePool } from '../helpers/seed.js';

const TEST_PORT = 3003;

describe('GET /api/users', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    await seedUser();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 token → 200 + 用户列表', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('无 token → 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/users（C-4 同步）', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效数据（指定 tenantId）→ 200 + 同步返回用户', async () => {
    const uniqueUsername = `newuser_${Date.now()}`;
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        username: uniqueUsername,
        password: 'password123',
        role: 'user',
        email: `${uniqueUsername}@test.local`,
        tenantId: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(uniqueUsername);
    expect(res.body.data.tenantId).toBe(1);
    // 验证: 不应再返回 taskId (异步队列)
    expect(res.body.taskId).toBeUndefined();
  });

  test('缺少 tenantId → 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        username: 'no_tenant',
        password: 'password123',
        role: 'user',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/tenantId/);
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'someuser', tenantId: 1 }); // 缺少 password

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('重复用户名 → 409', async () => {
    // 先创建一个
    const username = `dupuser_${Date.now()}`;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        username,
        password: 'password123',
        role: 'user',
        tenantId: 1,
      });

    // 再创建同名
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        username,
        password: 'password456',
        role: 'user',
        tenantId: 1,
      });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/users/:id（异步）', () => {
  let userId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    const user = await seedUser();
    userId = user.id;
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
      .put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'updated@test.local' });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});

describe('DELETE /api/users/:id（异步）', () => {
  let userId;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await cleanupTables();
    await seedTenant();
    const user = await seedUser();
    userId = user.id;
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
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBeDefined();

    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
  });
});
// 文件级清理
afterAll(async () => {
  await clearRedisQueue();
  await closeWorker();
});
