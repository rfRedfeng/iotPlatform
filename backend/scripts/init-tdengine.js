/**
 * TDengine 初始化脚本
 * 执行方式: node scripts/init-tdengine.js
 * 功能：创建库 + 超级表（device_data / device_status）+ 种子子表与数据
 *
 * 用 REST 协议与 TDengine 通信（端口 6041），不依赖 @tdengine/websocket，
 * 因此脚本不会引入额外的连接池 / transport 副作用。
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const HOST = process.env.TDENGINE_HOST || 'localhost';
const PORT = process.env.TDENGINE_PORT || '6041';
const USER = process.env.TDENGINE_USER || 'root';
const PASS = process.env.TDENGINE_PASSWORD || '';
const DB = process.env.TDENGINE_DB || 'iot_db';
const REST_URL = `http://${HOST}:${PORT}/rest/sql`;

const authHeader = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

async function exec(sql, useDb = true) {
  // TDengine REST 不保持 session，每条 SQL 通过 URL 带库名
  const url = useDb ? `http://${HOST}:${PORT}/rest/sql/${DB}` : REST_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: sql,
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`TDengine SQL 失败: code=${json.code} desc=${json.desc}\nSQL: ${sql}`);
  }
  return json;
}

async function main() {
  console.log('🔧 开始初始化 TDengine...');

  // 1. 创建库（IF NOT EXISTS 已支持）
  await exec(`CREATE DATABASE IF NOT EXISTS ${DB} PRECISION 'ms'`, false);
  console.log(`✅ 数据库 ${DB} 已就绪`);

  // 2. 超级表：device_data（每条记录 = 设备某个时刻的指标 JSON blob）
  await exec(`
    CREATE STABLE IF NOT EXISTS device_data (
      ts TIMESTAMP,
      metrics VARCHAR(2048)
    ) TAGS (
      device_id INT,
      tenant_id INT,
      area_id INT,
      device_type VARCHAR(64)
    )
  `);
  console.log('✅ 超级表 device_data 已创建');

  // 3. 超级表：device_status
  await exec(`
    CREATE STABLE IF NOT EXISTS device_status (
      ts TIMESTAMP,
      status VARCHAR(32)
    ) TAGS (
      device_id INT,
      tenant_id INT,
      area_id INT,
      device_type VARCHAR(64)
    )
  `);
  console.log('✅ 超级表 device_status 已创建');

  // 4. 种子数据：3 个设备，每个设备一次性 INSERT 24 条数据（TDengine 支持多行 VALUES）
  const seedDevices = [
    { id: 1, tenantId: 1, areaId: 4, deviceType: 'temperature_sensor' },
    { id: 2, tenantId: 1, areaId: 4, deviceType: 'temperature_sensor' },
    { id: 3, tenantId: 1, areaId: 5, deviceType: 'gas_sensor' },
  ];

  for (const d of seedDevices) {
    // 子表：d{deviceId} + s{deviceId}
    await exec(`
      CREATE TABLE IF NOT EXISTS d${d.id}
      USING device_data TAGS (${d.id}, ${d.tenantId}, ${d.areaId}, '${d.deviceType}')
    `);
    await exec(`
      CREATE TABLE IF NOT EXISTS s${d.id}
      USING device_status TAGS (${d.id}, ${d.tenantId}, ${d.areaId}, '${d.deviceType}')
    `);

    // 24 条数据点拼成单条 INSERT，省 23 次网络往返
    const valueRows = [];
    for (let h = 0; h < 24; h++) {
      const baseTemp = 22 + Math.sin((h - 6) / 24 * Math.PI * 2) * 6;
      const temp = +(baseTemp + (Math.random() - 0.5) * 0.6).toFixed(2);
      const humidity = +(50 + Math.cos(h / 24 * Math.PI * 2) * 15 + (Math.random() - 0.5) * 2).toFixed(2);
      const metrics = JSON.stringify({ temperature: temp, humidity }).replace(/'/g, "\\'");
      valueRows.push(`(NOW - ${h}h, '${metrics}')`);
    }
    await exec(`INSERT INTO d${d.id} VALUES ${valueRows.join(', ')}`);

    // 状态点批量写（同一时刻可能多状态时一起写）
    await exec(`INSERT INTO s${d.id} VALUES (NOW, 'online'), (NOW - 1h, 'online'), (NOW - 2h, 'offline')`);

    console.log(`✅ 设备 ${d.id}（${d.deviceType}）已写入 24 条历史数据 + 3 条状态`);
  }

  console.log('\n🎉 TDengine 初始化完成！');
  console.log(`\n查看：curl -u '${USER}:****' '${REST_URL}' -d 'SELECT COUNT(*) FROM ${DB}.device_data'`);
}

main().catch(err => {
  console.error('❌ 初始化失败:', err.message);
  process.exit(1);
});