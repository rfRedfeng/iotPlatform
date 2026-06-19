/**
 * 数据库迁移脚本
 * 添加告警规则的 severity 和 webhook_url 字段
 *
 * 执行方式: node scripts/add-alert-severity-and-webhook.mjs
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iot_platform'
};

async function migrate() {
  let conn;
  try {
    console.log('🔧 开始迁移数据库...\n');

    conn = await mysql.createConnection(mysqlConfig);

    // 检查并添加 severity 字段
    const [severityColumns] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'alert_rules' AND COLUMN_NAME = 'severity'
    `, [mysqlConfig.database]);

    if (severityColumns.length === 0) {
      await conn.query(`
        ALTER TABLE alert_rules
        ADD COLUMN severity ENUM('info', 'warn', 'error', 'critical') DEFAULT 'info' AFTER duration_seconds
      `);
      console.log('✅ 已添加 severity 字段到 alert_rules 表');
    } else {
      console.log('⚠️  severity 字段已存在，跳过');
    }

    // 检查并添加 webhook_url 字段
    const [webhookColumns] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'alert_rules' AND COLUMN_NAME = 'webhook_url'
    `, [mysqlConfig.database]);

    if (webhookColumns.length === 0) {
      await conn.query(`
        ALTER TABLE alert_rules
        ADD COLUMN webhook_url VARCHAR(512) NULL AFTER enabled
      `);
      console.log('✅ 已添加 webhook_url 字段到 alert_rules 表');
    } else {
      console.log('⚠️  webhook_url 字段已存在，跳过');
    }

    console.log('\n🎉 数据库迁移完成！\n');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
