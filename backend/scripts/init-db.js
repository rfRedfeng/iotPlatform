/**
 * 数据库初始化脚本
 * 执行方式: node scripts/init-db.js
 * 功能: 创建所有表 + 插入种子数据
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iot_platform',
  multipleStatements: true
};

const BCRYPT_ROUNDS = 12;

async function createDatabase() {
  // 先连接默认数据库创建目标数据库
  const cfg = { ...mysqlConfig, database: undefined };
  const conn = await mysql.createConnection(cfg);
  await conn.query(`CREATE DATABASE IF NOT EXISTS ${mysqlConfig.database}`);
  await conn.end();
  console.log(`✅ 数据库 ${mysqlConfig.database} 已创建`);
}

async function createTables(conn) {
  const sql = `
    -- 租户表
    CREATE TABLE IF NOT EXISTS tenants (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      status ENUM('active', 'suspended') DEFAULT 'active',
      max_devices INT DEFAULT 100,
      max_users INT DEFAULT 20,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL DEFAULT 0,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'manager', 'user') DEFAULT 'user',
      email VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    -- 区域表
    CREATE TABLE IF NOT EXISTS areas (
      id INT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      parent_id INT DEFAULT NULL,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (parent_id) REFERENCES areas(id)
    );

    -- 设备表
    CREATE TABLE IF NOT EXISTS devices (
      id INT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      area_id INT,
      name VARCHAR(100) NOT NULL,
      device_key VARCHAR(64) NOT NULL UNIQUE,
      device_secret VARCHAR(128) NOT NULL,
      protocol ENUM('mqtt', 'tcp', 'udp', 'coap') NOT NULL,
      device_type VARCHAR(50) NOT NULL DEFAULT 'generic',
      status ENUM('online', 'offline', 'inactive') DEFAULT 'offline',
      last_seen TIMESTAMP NULL,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (area_id) REFERENCES areas(id)
    );

    -- 设备配置表
    CREATE TABLE IF NOT EXISTS device_configs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      device_id INT NOT NULL,
      config_key VARCHAR(50) NOT NULL,
      config_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- 告警规则表
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      device_id INT,
      name VARCHAR(100) NOT NULL,
      metric VARCHAR(50) NOT NULL,
      \`condition\` ENUM('gt', 'lt', 'eq', 'gte', 'lte', 'ne') NOT NULL,
      threshold DECIMAL(20, 6) NOT NULL,
      duration_seconds INT DEFAULT 0,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- 告警事件表
    CREATE TABLE IF NOT EXISTS alert_events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      rule_id INT NOT NULL,
      device_id INT NOT NULL,
      trigger_value DECIMAL(20, 6) NOT NULL,
      triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      acknowledged BOOLEAN DEFAULT FALSE,
      acknowledged_by INT NULL,
      acknowledged_at TIMESTAMP NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (rule_id) REFERENCES alert_rules(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- Refresh Token 表
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      token VARCHAR(512) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `;

  await conn.query(sql);
  console.log('✅ 所有表已创建');
}

async function seedData(conn) {
  // 1. 创建默认租户
  await conn.query(`
    INSERT IGNORE INTO tenants (id, name, status, max_devices, max_users)
    VALUES (1, '管理组', 'active', 1000, 50),
            (2, '测试租户', 'active', 500, 20)
  `);
  console.log('✅ 租户数据已插入');

  // 2. 创建系统管理员（划归默认租户，方便后续给租户内创建用户）
  const adminPasswordHash = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
  await conn.query(`
    INSERT IGNORE INTO users (tenant_id, username, password_hash, role, email)
    VALUES (1, 'admin', ?, 'admin', 'admin@iot.local')
  `, [adminPasswordHash]);

  // 创建租户内管理员
  const managerPasswordHash = await bcrypt.hash('manager123', BCRYPT_ROUNDS);
  await conn.query(`
    INSERT IGNORE INTO users (tenant_id, username, password_hash, role, email)
    VALUES (2, 'manager', ?, 'manager', 'manager@iot.local')
  `, [managerPasswordHash]);

  // 创建普通用户
  const userPasswordHash = await bcrypt.hash('user123', BCRYPT_ROUNDS);
  await conn.query(`
    INSERT IGNORE INTO users (tenant_id, username, password_hash, role, email)
    VALUES (2, 'user', ?, 'user', 'user@iot.local')
  `, [userPasswordHash]);
  console.log('✅ 用户数据已插入（admin/admin123, manager/manager123, user/user123）');

  // 3. 创建示例区域
  await conn.query(`
    INSERT IGNORE INTO areas (id, tenant_id, parent_id, name, code, description)
    VALUES
      (1, 2, NULL, '总部大楼', 'HQ', '总部办公大楼'),
      (2, 2, 1, '1号楼', 'HQ-B1', '1号办公楼'),
      (3, 2, 1, '2号楼', 'HQ-B2', '2号办公楼'),
      (4, 2, 2, '1层', 'HQ-B1-F1', '1号楼1层'),
      (5, 2, 2, '2层', 'HQ-B1-F2', '1号楼2层')
  `);
  console.log('✅ 区域数据已插入');

  // 4. 创建示例设备
  await conn.query(`
    INSERT IGNORE INTO devices (id, tenant_id, area_id, name, device_key, device_secret, protocol, device_type, status)
    VALUES
      (1, 2, 4, '温湿度传感器-001', 'dev_a1b2c3d4e5f6', 'sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'mqtt', 'temperature_sensor', 'offline'),
      (2, 2, 4, '温湿度传感器-002', 'dev_f6e5d4c3b2a1', 'sec_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', 'mqtt', 'temperature_sensor', 'offline'),
      (3, 2, 5, '气体检测器-001',   'dev_gas001dasdas', 'sec_gas001sec001sec001sec001sec001', 'tcp', 'gas_sensor', 'offline')
  `);
  console.log('✅ 设备数据已插入');

  // 5. 创建示例告警规则
  await conn.query(`
    INSERT IGNORE INTO alert_rules (id, tenant_id, device_id, name, metric, \`condition\`, threshold, duration_seconds, enabled)
    VALUES
      (1, 2, 1, '温度过高告警', 'temperature', 'gt', 35.0, 0, TRUE),
      (2, 2, 1, '湿度过低告警', 'humidity', 'lt', 30.0, 60, TRUE),
      (3, 2, 3, 'CO2浓度过高', 'CO2', 'gt', 1000.0, 0, TRUE)
  `);
  console.log('✅ 告警规则数据已插入');
}

async function main() {
  let conn;
  try {
    console.log('🔧 开始初始化数据库...');
    await createDatabase();

    conn = await mysql.createConnection(mysqlConfig);
    await createTables(conn);
    await seedData(conn);

    console.log('\n🎉 数据库初始化完成！\n');
    console.log('测试账号:');
    console.log('  admin/admin123    (系统管理员, tenant_id=1)');
    console.log('  manager/manager123 (租户管理员, tenant_id=2)');
    console.log('  user/user123      (普通用户, tenant_id=2)');
  } catch (err) {
    console.error('❌ 初始化失败:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
