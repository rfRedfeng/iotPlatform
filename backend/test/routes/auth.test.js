/**
 * 认证路由集成测试
 * POST /api/auth/login, /register, /refresh
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../test-server.js';
import { adminToken, userToken } from '../helpers/auth.js';
import { clearRedisQueue } from '../setup.js';
import { cleanupTables, seedTenant, seedAdmin, closePool } from '../helpers/seed.js';

const TEST_PORT = 3001;

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await seedTenant();
    await seedAdmin();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('正确密码 → 200 + accessToken + refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.username).toBe('test_admin');
  });

  test('错误密码 → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('密码错误');
  });

  test('用户名不存在 → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('缺少参数 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin' }); // 缺少 password

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/refresh', () => {
  let refreshToken;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await seedTenant();
    await seedAdmin();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效 refreshToken → 200 + 新 accessToken', async () => {
    // 先登录获取 refreshToken
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'admin123' });

    refreshToken = loginRes.body.data.refreshToken;

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('无效 refreshToken → 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('缺少 refreshToken → 400', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/register（异步）', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  beforeEach(async () => {
    await clearRedisQueue();
  });

  test('有效注册信息 → 202 + taskId', async () => {
    const uniqueUsername = `newuser_${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: uniqueUsername,
        password: 'password123',
        role: 'user',
        email: `${uniqueUsername}@test.local`,
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.taskId).toBeDefined();

    // 验证任务已入队
    const { waitForTaskResult } = await import('../helpers/redis.js');
    const result = await waitForTaskResult(res.body.taskId, 5000);
    expect(result).not.toBeNull();
    expect(result.status).toBe('success');
    expect(result.data.username).toBe(uniqueUsername);
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'someuser' }); // 缺少 password

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});