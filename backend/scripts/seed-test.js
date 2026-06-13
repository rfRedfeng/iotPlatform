/**
 * 测试数据构建脚本
 * 执行方式: node scripts/seed-test.js
 * 功能: 为指定租户构建完整测试数据集（设备、用户、告警规则、告警事件）
 * 用法: node scripts/seed-test.js [tenantId]
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iot_platform'
};

const BCRYPT_ROUNDS = 12;

// ========== 测试数据生成器 ==========

function genDeviceKey() {
  return `dev_${crypto.randomBytes(8).toString('hex')}`;
}

function genDeviceSecret() {
  return `sec_${crypto.randomBytes(24).toString('hex')}`;
}

function genAreaCode(prefix = 'AREA') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// ========== 设备类型模板 ==========

const DEVICE_TEMPLATES = [
  { type: 'temperature_sensor', protocol: 'mqtt', metrics: ['temperature', 'humidity'] },
  { type: 'gas_sensor', protocol: 'tcp', metrics: ['CO2', 'PM25', 'formaldehyde'] },
  { type: 'power_meter', protocol: 'mqtt', metrics: ['power', 'voltage', 'current'] },
  { type: 'gps_tracker', protocol: 'udp', metrics: ['lat', 'lng', 'speed', 'altitude'] },
  { type: 'light_sensor', protocol: 'coap', metrics: ['lux', 'status'] },
];

// ========== 生成测试用户 ==========

async function createTestUsers(conn, tenantId, count = 3) {
  const results = [];
  const passwordHash = await bcrypt.hash('test123', BCRYPT_ROUNDS);

  for (let i = 1; i <= count; i++) {
    const username = `test_user_${tenantId}_${i}`;
    const role = i === 1 ? 'manager' : 'user';
    await conn.query(`
      INSERT IGNORE INTO users (tenant_id, username, password_hash, role, email)
      VALUES (?, ?, ?, ?, ?)
    `, [tenantId, username, passwordHash, role, `${username}@test.local`]);
    results.push({ username, password: 'test123', role });
  }
  return results;
}

// ========== 生成测试区域 ==========

async function createTestAreas(conn, tenantId, count = 5) {
  const areas = [];
  const rootAreaId = randomBetween(1000, 9999);

  // 创建根区域
  const rootCode = genAreaCode(`T${tenantId}`);
  await conn.query(`
    INSERT IGNORE INTO areas (id, tenant_id, parent_id, name, code, description)
    VALUES (?, ?, NULL, ?, ?, ?)
  `, [rootAreaId, tenantId, `测试区域-${tenantId}`, rootCode, `租户${tenantId}的测试根区域`]);
  areas.push({ id: rootAreaId, name: `测试区域-${tenantId}` });

  // 创建子区域
  for (let i = 1; i <= count; i++) {
    const areaId = rootAreaId + i;
    const name = `测试子区域-${i}`;
    const code = genAreaCode(`T${tenantId}S`);
    const parentId = rootAreaId;
    await conn.query(`
      INSERT IGNORE INTO areas (id, tenant_id, parent_id, name, code, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [areaId, tenantId, parentId, name, code, `${name}的描述`]);
    areas.push({ id: areaId, name, parentId });
  }

  return areas;
}

// ========== 生成测试设备 ==========

async function createTestDevices(conn, tenantId, areas, count = 10) {
  const devices = [];

  for (let i = 1; i <= count; i++) {
    const template = DEVICE_TEMPLATES[i % DEVICE_TEMPLATES.length];
    const areaId = areas[i % areas.length].id;
    const deviceKey = genDeviceKey();
    const deviceSecret = genDeviceSecret();

    await conn.query(`
      INSERT IGNORE INTO devices (tenant_id, area_id, name, device_key, device_secret, protocol, device_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'offline')
    `, [tenantId, areaId, `${template.type}-${i}`, deviceKey, deviceSecret, template.protocol, template.type]);

    devices.push({
      name: `${template.type}-${i}`,
      deviceKey,
      deviceSecret,
      protocol: template.protocol,
      deviceType: template.type,
      metrics: template.metrics
    });
  }

  return devices;
}

// ========== 生成测试告警规则 ==========

async function createTestAlertRules(conn, tenantId, devices, countPerDevice = 2) {
  const rules = [];
  const conditions = ['gt', 'lt', 'gte', 'lte', 'eq'];
  const conditionLabels = { gt: '>', lt: '<', gte: '>=', lte: '<=', eq: '=' };

  for (const device of devices) {
    const template = DEVICE_TEMPLATES.find(t => t.type === device.deviceType);
    if (!template) continue;

    for (let i = 0; i < Math.min(countPerDevice, template.metrics.length); i++) {
      const metric = template.metrics[i];
      const condition = conditions[i % conditions.length];
      const threshold = randomFloat(20, 100);

      await conn.query(`
        INSERT IGNORE INTO alert_rules (tenant_id, device_id, name, metric, \`condition\`, threshold, duration_seconds, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [tenantId, null, `${device.name}-${metric}-${conditionLabels[condition]}`, metric, condition, threshold, randomBetween(0, 300)]);

      rules.push({ device: device.name, metric, condition, threshold });
    }
  }

  return rules;
}

// ========== 生成历史告警事件 ==========

async function createTestAlertEvents(conn, tenantId, days = 7) {
  const now = Date.now();
  const events = [];

  for (let d = 0; d < days; d++) {
    const eventCount = randomBetween(0, 5);
    for (let e = 0; e < eventCount; e++) {
      const triggeredAt = new Date(now - d * 24 * 60 * 60 * 1000 - randomBetween(0, 86400000));
      const acknowledged = Math.random() > 0.3;
      const acknowledgedAt = acknowledged ? triggeredAt.toISOString().slice(0, 19).replace('T', ' ') : null;

      // 先查一条告警规则和设备
      const [ruleRows] = await conn.query(`
        SELECT id FROM alert_rules WHERE tenant_id = ? ORDER BY RAND() LIMIT 1
      `, [tenantId]);
      const [deviceRows] = await conn.query(`
        SELECT id FROM devices WHERE tenant_id = ? ORDER BY RAND() LIMIT 1
      `, [tenantId]);
      if (!ruleRows.length || !deviceRows.length) continue;

      const [userRows] = acknowledged ? await conn.query(`
        SELECT id FROM users WHERE tenant_id = ? ORDER BY RAND() LIMIT 1
      `, [tenantId]) : [[]];

      await conn.query(`
        INSERT INTO alert_events (tenant_id, rule_id, device_id, trigger_value, triggered_at, acknowledged, acknowledged_by, acknowledged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tenantId,
        ruleRows[0].id,
        deviceRows[0].id,
        randomFloat(10, 150),
        triggeredAt.toISOString().slice(0, 19).replace('T', ' '),
        acknowledged ? 1 : 0,
        acknowledged && userRows.length ? userRows[0].id : null,
        acknowledgedAt
      ]);
      events.push({ triggeredAt, acknowledged });
    }
  }

  return events;
}

// ========== 主函数 ==========

async function main() {
  const tenantId = parseInt(process.argv[2] || '1');
  const deviceCount = parseInt(process.argv[3] || '10');

  let conn;
  try {
    console.log(`\n🔧 开始为租户 ${tenantId} 构建测试数据...`);
    console.log(`   设备数量: ${deviceCount}\n`);

    conn = await mysql.createConnection(mysqlConfig);

    // 检查租户是否存在
    const [tenants] = await conn.query('SELECT id FROM tenants WHERE id = ?', [tenantId]);
    if (tenants.length === 0) {
      console.error(`❌ 租户 ${tenantId} 不存在，请先运行 init-db.js`);
      process.exit(1);
    }

    // 构建测试数据
    console.log('📦 创建测试用户...');
    const users = await createTestUsers(conn, tenantId);

    console.log('📦 创建测试区域...');
    const areas = await createTestAreas(conn, tenantId, Math.ceil(deviceCount / 2));

    console.log('📦 创建测试设备...');
    const devices = await createTestDevices(conn, tenantId, areas, deviceCount);

    console.log('📦 创建告警规则...');
    const rules = await createTestAlertRules(conn, tenantId, devices);

    console.log('📦 创建历史告警事件...');
    const events = await createTestAlertEvents(conn, tenantId, 7);

    console.log('\n🎉 测试数据构建完成！\n');
    console.log('📊 数据统计:');
    console.log(`   用户: ${users.length} 个`);
    console.log(`   区域: ${areas.length} 个`);
    console.log(`   设备: ${devices.length} 个`);
    console.log(`   告警规则: ${rules.length} 条`);
    console.log(`   告警事件: ${events.length} 条\n`);
    console.log('🔑 测试账号:');
    users.forEach(u => console.log(`   ${u.username} / ${u.password} (${u.role})`));
    console.log('\n💡 设备凭证（前3个）:');
    devices.slice(0, 3).forEach(d => console.log(`   ${d.name}: key=${d.deviceKey} secret=${d.deviceSecret}`));
  } catch (err) {
    console.error('❌ 测试数据构建失败:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();