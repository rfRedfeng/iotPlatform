import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

if (!process.env.JWT_SECRET) {
  console.error('[JWT] FATAL: JWT_SECRET environment variable must be set');
  process.exit(1);
}

const jwtConfig = {
  secret: process.env.JWT_SECRET,
  accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
  refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
  issuer: 'node-iot-platform',
};

/**
 * 签发 Access Token
 * jti 必带：即便同 payload + 同 iat 也能区分，避免后续入库时 UNIQUE 冲突
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: jwtConfig.issuer,
    jwtid: crypto.randomUUID(),
  });
}

/**
 * 签发 Refresh Token
 */
export function signRefreshToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: jwtConfig.issuer,
    jwtid: crypto.randomUUID(),
  });
}

/**
 * 验证 Token
 * @returns {object|null} 解码后的 payload，或 null（失败）
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtConfig.secret, { issuer: jwtConfig.issuer });
  } catch {
    return null;
  }
}

export default jwtConfig;