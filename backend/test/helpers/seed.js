/**
 * 测试辅助：测试数据构造
 * 在各测试的 beforeEach 中调用，清理并重建最小测试数据
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'iot_platform',
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

/**
 * 清理所有业务表（保留 tenants 表）
 */
export async function cleanupTables() {
  const p = getPool();
  await p.execute('SET FOREIGN_KEY_CHECKS = 0');
  await p.execute('TRUNCATE TABLE alert_events');
  await p.execute('TRUNCATE TABLE alert_rules');
  await p.execute('TRUNCATE TABLE device_configs');
  await p.execute('TRUNCATE TABLE devices');
  await p.execute('TRUNCATE TABLE areas');
  await p.execute('TRUNCATE TABLE users');
  await p.execute('TRUNCATE TABLE refresh_tokens');
  await p.execute('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * 创建最小测试租户（tenantId=1）
 */
export async function seedTenant() {
  const p = getPool();
  await p.execute(
    'INSERT IGNORE INTO tenants (id, name, status, max_devices, max_users) VALUES (1, ?, ?, ?, ?)',
    ['Test Tenant', 'active', 1000, 50]
  );
}

/**
 * 创建测试用户并返回信息
 */
export async function seedUser(overrides = {}) {
  const p = getPool();
  const passwordHash = await bcrypt.hash('test123', 12);
  const user = {
    tenantId: 1,
    username: `testuser_${Date.now()}`,
    passwordHash,
    role: 'user',
    email: 'test@test.local',
    ...overrides,
  };
  const [result] = await p.execute(
    'INSERT INTO users (tenant_id, username, password_hash, role, email) VALUES (?, ?, ?, ?, ?)',
    [user.tenantId, user.username, user.passwordHash, user.role, user.email]
  );
  return { id: result.insertId, ...user, password: 'test123' };
}

/**
 * 创建测试管理员用户
 */
export async function seedAdmin() {
  const p = getPool();
  const passwordHash = await bcrypt.hash('admin123', 12);
  try {
    await p.execute(
      'INSERT INTO users (tenant_id, username, password_hash, role, email) VALUES (?, ?, ?, ?, ?)',
      [1, 'test_admin', passwordHash, 'admin', 'admin@test.local']
    );
  } catch (e) {
    // 可能已存在
  }
  const [rows] = await p.execute('SELECT * FROM users WHERE username = ?', ['test_admin']);
  return rows[0];
}

/**
 * 创建测试区域
 */
export async function seedArea(tenantId = 1) {
  const p = getPool();
  const [result] = await p.execute(
    'INSERT INTO areas (tenant_id, name, code, parent_id) VALUES (?, ?, ?, ?)',
    [tenantId, `Test Area ${Date.now()}`, `TA${Date.now()}`, null]
  );
  return result.insertId;
}

/**
 * 创建测试设备
 */
export async function seedDevice(tenantId = 1, areaId = null) {
  const p = getPool();
  const deviceKey = `dev_${Math.random().toString(16).slice(2)}${Date.now()}`;
  const deviceSecret = `sec_${Math.random().toString(16).slice(2)}${Date.now()}`;
  const [result] = await p.execute(
    'INSERT INTO devices (tenant_id, area_id, name, device_key, device_secret, protocol, device_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [tenantId, areaId, 'Test Device', deviceKey, deviceSecret, 'mqtt', 'temperature_sensor', 'offline']
  );
  return result.insertId;
}

/**
 * 关闭连接池
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}