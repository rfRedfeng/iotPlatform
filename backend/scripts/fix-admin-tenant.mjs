import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'iot_platform',
});

const [r] = await conn.query("UPDATE users SET tenant_id = 1 WHERE username = 'admin'");
console.log('更新 admin.tenant_id 影响行数:', r.affectedRows);
const [rows] = await conn.query("SELECT id, username, tenant_id, role FROM users WHERE username='admin'");
console.log('admin 当前行:', rows);
await conn.end();