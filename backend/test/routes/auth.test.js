/**
 * 认证路由集成测试
 * POST /api/auth/login, /register, /refresh, /logout
 */
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { app, server, closeWorker } from '../test-server.js';
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

describe('POST /api/auth/register（C-4 同步）', () => {
  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    await seedTenant();
  });

  afterAll(async () => {
    server.close();
    await closePool();
  });

  test('有效注册信息（带 admin token）→ 200 + 同步返回用户', async () => {
    const uniqueUsername = `newuser_${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        username: uniqueUsername,
        password: 'password123',
        role: 'user',
        email: `${uniqueUsername}@test.local`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(uniqueUsername);
    // 验证: 不应再返回 taskId (异步队列)
    expect(res.body.taskId).toBeUndefined();
  });

  test('无 token → 401', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'someone', password: 'password123' });
    expect(res.status).toBe(401);
  });

  test('缺少必填字段 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'someuser' });
    expect(res.status).toBe(400);
  });

  test('密码过短 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'short_pw', password: '123' });
    expect(res.status).toBe(400);
  });

  test('重复用户名 → 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ username: 'test_admin', password: 'password123' });
    expect(res.status).toBe(409);
  });
});

// 文件级清理
afterAll(async () => {
  await clearRedisQueue();
  await closeWorker();
});

// ============================================================
// C-1: refreshToken 过期检查 + logout 端点
// ============================================================
describe('C-1: refreshToken expiresAt & logout', () => {
  let pool;

  beforeAll(async () => {
    await new Promise(resolve => server.listen(TEST_PORT + 10, resolve));
    await cleanupTables();
    await seedTenant();
    await seedAdmin();
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'iot_platform',
      connectionLimit: 2,
    });
  });

  afterAll(async () => {
    server.close();
    if (pool) await pool.end();
    await closePool();
  });

  test('DB 中 expiresAt 已过期的 refreshToken → 401', async () => {
    // 1) 登录拿真实 refreshToken
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'admin123' });
    const expiredToken = loginRes.body.data.refreshToken;

    // 2) 把这一行的 expires_at 改成过去时间
    await pool.execute(
      'UPDATE refresh_tokens SET expires_at = ? WHERE token = ?',
      [new Date(Date.now() - 60_000), expiredToken]
    );

    // 3) 调 /api/auth/refresh,期望 401
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/expired|not found/i);

    // 4) 副作用:该过期行应被自动删除
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM refresh_tokens WHERE token = ?',
      [expiredToken]
    );
    expect(Number(rows[0].cnt)).toBe(0);
  });

  test('POST /api/auth/logout 不带 refreshToken → 删除该用户所有 refreshToken', async () => {
    // 1) 登录 2 次,产生 2 条 refreshToken
    await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'admin123' });
    await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'admin123' });
    const [beforeRows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM refresh_tokens WHERE user_id = 1'
    );
    expect(Number(beforeRows[0].cnt)).toBeGreaterThanOrEqual(2);

    // 2) 拿一个 access token 用于鉴权
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'admin123' });
    const accessToken = loginRes.body.data.accessToken;

    // 3) 调 logout 端点 (不带 refreshToken, 走 deleteAllForUser)
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBeGreaterThanOrEqual(3);

    // 4) 该用户的 refreshToken 应当全删
    const [afterRows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM refresh_tokens WHERE user_id = 1'
    );
    expect(Number(afterRows[0].cnt)).toBe(0);
  });

  test('POST /api/auth/logout 带 refreshToken → 只删一条,其他会话不受影响', async () => {
    // 登录 2 次,产生 2 条 refreshToken
    const a = await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'admin123' });
    const b = await request(app).post('/api/auth/login').send({ username: 'test_admin', password: 'admin123' });

    // 用 a 的 accessToken 鉴权,带 b 的 refreshToken → 只删 b
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`)
      .send({ refreshToken: b.body.data.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(1);

    // a 的 refreshToken 仍应可用
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: a.body.data.refreshToken });
    expect(refresh.status).toBe(200);
  });

  test('logout 不带 token 时,传空 body 也可工作(只依赖 accessToken 鉴权)', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_admin', password: 'admin123' });
    const accessToken = loginRes.body.data.accessToken;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});