/**
 * SQL 注入防御工具 (C-2 / C-3)
 *
 * TDengine 3.x 的 REST 端点 (/rest/sql/<db>) 不支持预编译参数,只能字符串拼接。
 * 本模块提供 JS 层的白名单校验 + 转义,作为"安全网"。
 *
 * 设计原则:
 * 1. 严格白名单优先 (assertIntegerId / assertIsoTimestamp / assertEnum)
 * 2. 对实在需要拼接的字符串 (status / deviceType / JSON metrics) 做完整转义
 * 3. 失败时一律抛 AppError(400),不让脏数据进入 SQL
 *
 * 注意: 这些不是银弹。MySQL 等已支持 ? 占位符的库,请优先用占位符。
 */

import { AppError } from '../middleware/errorHandler.js';

/**
 * 断言是正整数 (>=1)
 */
export function assertIntegerId(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) {
    throw new AppError(`Invalid ${name}: must be a positive integer`, 400);
  }
  return n;
}

/**
 * 断言是非负整数 (>=0) — 用于 pageSize / offset / tenantId=0
 */
export function assertNonNegativeInt(value, name = 'value') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new AppError(`Invalid ${name}: must be a non-negative integer`, 400);
  }
  return n;
}

/**
 * 断言是 ISO 8601 时间戳 (2024-01-01T00:00:00Z 或带时区偏移)
 */
export function assertIsoTimestamp(value, name = 'timestamp') {
  if (typeof value !== 'string') {
    throw new AppError(`Invalid ${name}: must be a string`, 400);
  }
  // 严格 ISO 8601: YYYY-MM-DDTHH:MM:SS[.sss][Z|±HH:MM]
  const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/;
  if (!ISO_8601.test(value)) {
    throw new AppError(`Invalid ${name}: must be ISO 8601 format`, 400);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(`Invalid ${name}: not a valid date`, 400);
  }
  return value;
}

/**
 * 断言值在白名单 enum 内
 */
export function assertEnum(value, allowed, name = 'value') {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new AppError(`Invalid ${name}: must be one of [${allowed.join(', ')}]`, 400);
  }
  return value;
}

/**
 * 断言是合法 JS 对象 (非 null, 非 array) — 用于 metrics
 */
export function assertPlainObject(value, name = 'value') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`Invalid ${name}: must be a plain object`, 400);
  }
  return value;
}

/**
 * 转义 TDengine 字符串字面量内可能引入注入的字符
 *
 * TDengine 字符串用单引号包裹,且 C 风格转义 (反斜杠 + 引号)。
 * 攻击者 payload 形如:  '; DROP TABLE d1; --
 * 经本函数后,所有反斜杠/单引号/控制字符都被转义,无法逃逸引号边界。
 *
 * 同时限制长度 (1KB) 以防 DoS。
 */
export function escapeTdengineString(value, name = 'string', maxLen = 1024) {
  if (typeof value !== 'string') {
    throw new AppError(`Invalid ${name}: must be a string`, 400);
  }
  if (value.length > maxLen) {
    throw new AppError(`Invalid ${name}: too long (max ${maxLen})`, 400);
  }
  // 反斜杠必须先转,避免把后续的转义符也吞掉
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0');
}

/**
 * 把 JS 对象转成 TDengine 字符串字面量
 * 流程: 深拷贝 → JSON.stringify → 字符转义
 *
 * 用于 metrics / status 等动态字段。
 */
export function jsonToTdengineString(value, name = 'json') {
  assertPlainObject(value, name);
  let json;
  try {
    json = JSON.stringify(value);
  } catch (e) {
    throw new AppError(`Invalid ${name}: not serializable`, 400);
  }
  return escapeTdengineString(json, name, 64 * 1024);
}

/**
 * 把数字安全转成字符串 (用于 device_type, status 等 enum-like 字段)
 * 不允许任何特殊字符,只允许 [A-Za-z0-9_-]
 */
export function assertSafeIdentifier(value, name = 'identifier', maxLen = 64) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AppError(`Invalid ${name}: only [A-Za-z0-9_-] allowed`, 400);
  }
  if (value.length > maxLen) {
    throw new AppError(`Invalid ${name}: too long (max ${maxLen})`, 400);
  }
  return value;
}
