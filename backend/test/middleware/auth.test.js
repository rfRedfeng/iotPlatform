/**
 * auth 中间件测试
 * 测试 Bearer token 验证逻辑
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockVerifyToken = jest.fn();
jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  verifyToken: mockVerifyToken,
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

const { authMiddleware } = await import('../../src/middleware/auth.js');

describe('authMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    mockVerifyToken.mockReset();
  });

  test('缺少 Authorization header → 401', async () => {
    await authMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 401, message: expect.stringContaining('Missing') }),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('Authorization header 不以 Bearer 开头 → 401', async () => {
    mockReq.headers.authorization = 'Basic abc123';
    await authMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('无效 token（verifyToken 返回 null）→ 401', async () => {
    mockReq.headers.authorization = 'Bearer invalid.token.here';
    mockVerifyToken.mockReturnValue(null);
    await authMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ message: expect.stringContaining('Invalid') }),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('有效 token → req.user 注入，next() 被调用', async () => {
    const payload = { userId: 1, username: 'admin', role: 'admin', tenantId: 1 };
    mockReq.headers.authorization = 'Bearer valid.token';
    mockVerifyToken.mockReturnValue(payload);
    await authMiddleware(mockReq, mockRes, mockNext);
    expect(mockReq.user).toEqual(payload);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  test('过期 token → 401', async () => {
    mockReq.headers.authorization = 'Bearer expired.token';
    mockVerifyToken.mockReturnValue(null); // jwt.verify 过期会抛异常，被 verifyToken 捕获返回 null
    await authMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});