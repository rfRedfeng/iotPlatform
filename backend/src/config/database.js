import 'dotenv/config';

export const mysql = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true, // 设置连接池等待连接的选项
  connectionLimit: 10, // 设置连接池的最大连接数
  queueLimit: 0, // 设置连接池的最大等待队列数，0表示不限制
  timezone: '+08:00', // 设置时区为北京时间
};

export const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
};

export const tdengine = {
  host: process.env.TDENGINE_HOST || 'localhost',
  port: parseInt(process.env.TDENGINE_PORT || '6030'),
  user: process.env.TDENGINE_USER,
  password: process.env.TDENGINE_PASSWORD,
  database: process.env.TDENGINE_DB,
};

