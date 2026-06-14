/**
 * TDengine 测试种子
 * 在测试用例里调用 seedTimeSeriesData()，可以快速插入一批历史数据点，
 * 让 dashboard/trends 这类依赖时间序列的端到端测试拿到真实返回。
 *
 * 用 REST 协议与 TDengine 通信，避免引入 WebSocket 连接副作用。
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const HOST = process.env.TDENGINE_HOST || 'localhost';
const PORT = process.env.TDENGINE_PORT || '6041';
const USER = process.env.TDENGINE_USER || 'root';
const PASS = process.env.TDENGINE_PASSWORD || '';
const DB = process.env.TDENGINE_DB || 'iot_db';
const REST_URL = `http://${HOST}:${PORT}/rest/sql`;
const authHeader = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

async function exec(sql) {
  const res = await fetch(`${REST_URL}/${DB}`, {
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

/**
 * 给指定设备插入一批连续时间序列数据
 * @param {object} opts
 * @param {number} opts.deviceId      - 子表 id（生成 d{deviceId} 子表）
 * @param {number} opts.tenantId
 * @param {number} opts.areaId
 * @param {string} opts.deviceType
 * @param {number} [opts.hours=24]    - 插入多少个时间点（每隔 1h 一个）
 * @param {object} [opts.metricBuilder] - (h) => { temperature, humidity, ... }
 */
export async function seedTimeSeriesData(opts) {
  const { deviceId, tenantId, areaId, deviceType, hours = 24, metricBuilder } = opts;
  await exec(`
    CREATE TABLE IF NOT EXISTS d${deviceId}
    USING device_data TAGS (${deviceId}, ${tenantId}, ${areaId}, '${deviceType}')
  `);

  const rows = [];
  for (let h = 0; h < hours; h++) {
    const metrics = metricBuilder
      ? metricBuilder(h)
      : { temperature: 20 + h * 0.5, humidity: 50 };
    const escaped = JSON.stringify(metrics).replace(/'/g, "\\'");
    rows.push(`(NOW - ${h}h, '${escaped}')`);
  }
  await exec(`INSERT INTO d${deviceId} VALUES ${rows.join(', ')}`);
}

/**
 * 删除指定设备的时序数据（不影响表结构）
 */
export async function dropTimeSeriesData(deviceId) {
  try {
    await exec(`DELETE FROM d${deviceId}`);
  } catch (e) {
    // 表不存在时忽略
    if (!String(e.message).includes('does not exist')) throw e;
  }
}

/**
 * 一站式初始化：建超级表 + 写 3 个示例设备的最近 24h 数据
 * 测试启动时调用一次即可
 */
export async function initTdengineSchema() {
  await exec(`CREATE STABLE IF NOT EXISTS device_data (
    ts TIMESTAMP,
    metrics VARCHAR(2048)
  ) TAGS (device_id INT, tenant_id INT, area_id INT, device_type VARCHAR(64))`);
  await exec(`CREATE STABLE IF NOT EXISTS device_status (
    ts TIMESTAMP,
    status VARCHAR(32)
  ) TAGS (device_id INT, tenant_id INT, area_id INT, device_type VARCHAR(64))`);
}