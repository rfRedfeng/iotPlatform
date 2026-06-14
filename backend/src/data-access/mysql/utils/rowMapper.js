/**
 * 行映射工具
 * mysql2 返回的行是 snake_case (tenant_id, password_hash...)，
 * 但业务层用 camelCase (tenantId, passwordHash...)。
 * 在 repository 层把行转成 camelCase，业务层就不用感知底层列名。
 */

const SNAKE_RE = /_([a-z0-9])/g;

function snakeToCamelKey(key) {
  return key.replace(SNAKE_RE, (_, ch) => ch.toUpperCase());
}

/**
 * 把一行 DB 记录从 snake_case 转为 camelCase
 * @param {Object} row
 * @returns {Object}
 */
export function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const key of Object.keys(row)) {
    out[snakeToCamelKey(key)] = row[key];
  }
  return out;
}

/**
 * 批量行映射
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
export function rowsToCamel(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(rowToCamel);
}