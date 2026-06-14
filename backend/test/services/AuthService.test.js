/**
 * AuthService 单元测试 (C-1 回归)
 * 覆盖: verifyRefreshToken DB expiresAt 校验
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockFindByToken = jest.fn();
const mockDeleteByToken = jest.fn();
const mockCreateToken = jest.fn();

jest.unstable_mockModule('../../src/data-access/mysql/repositories/RefreshTokenRepository.js', () => ({
  default: {
    findByToken: (...a) => mockFindByToken(...a),
    deleteByToken: (...a) => mockDeleteByToken(...a),
    create: (...a) => mockCreateToken(...a),
  },
}));

jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  signAccessToken: () => 'fake-access',
  signRefreshToken: () => 'fake-refresh',
  verifyToken: (token) => {
    if (token === 'valid-refresh-token') return { userId: 1, username: 'admin', role: 'admin', tenantId: 1 };
    if (token === 'expired-jwt-token') return null;
    return null;
  },
}));

const { verifyRefreshToken, refreshAccessToken } = await import('../../src/services/AuthService.js');

describe('verifyRefreshToken (C-1)', () => {
  beforeEach(() => { mockFindByToken.mockReset(); });

  test('refreshToken 为空 → null', async () => {
    expect(await verifyRefreshToken(null)).toBeNull();
    expect(await verifyRefreshToken('')).toBeNull();
  });

  test('JWT 签名无效 → null', async () => {
    expect(await verifyRefreshToken('expired-jwt-token')).toBeNull();
  });

  test('DB 中不存在 → null', async () => {
    mockFindByToken.mockResolvedValue(null);
    expect(await verifyRefreshToken('valid-refresh-token')).toBeNull();
  });

  test('DB 中 expiresAt 已过 → null', async () => {
    mockFindByToken.mockResolvedValue({
      id: 1, userId: 1, token: 'x',
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await verifyRefreshToken('valid-refresh-token')).toBeNull();
  });

  test('DB 中 expiresAt 有效 → 返回 payload', async () => {
    mockFindByToken.mockResolvedValue({
      id: 1, userId: 1, token: 'x',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const result = await verifyRefreshToken('valid-refresh-token');
    expect(result).toEqual({ userId: 1, username: 'admin', role: 'admin', tenantId: 1 });
  });
});

describe('refreshAccessToken (C-1)', () => {
  beforeEach(() => {
    mockFindByToken.mockReset();
    mockDeleteByToken.mockReset();
    mockDeleteByToken.mockResolvedValue(true);
  });

  test('DB 中 expiresAt 已过 → 抛异常 + 自动删除该行', async () => {
    mockFindByToken.mockResolvedValue({
      id: 1, userId: 1, token: 'valid-refresh-token',
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(refreshAccessToken('valid-refresh-token')).rejects.toThrow(/expired/);
    expect(mockDeleteByToken).toHaveBeenCalledWith('valid-refresh-token');
  });
});
