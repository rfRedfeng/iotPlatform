import 'dotenv/config';
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
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: jwtConfig.issuer,
  });
}

/**
 * 签发 Refresh Token
 */
export function signRefreshToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: jwtConfig.issuer,
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