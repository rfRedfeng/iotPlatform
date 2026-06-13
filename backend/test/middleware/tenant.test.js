/**
 * tenant 中间件测试
 * 测试租户隔离逻辑
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockVerifyToken = jest.fn();
jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  verifyToken: mockVerifyToken,
}));

const { tenantMiddleware } = await import('../../src/middleware/tenant.js');

describe('tenantMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  test('无 req.user → 401', async () => {
    await tenantMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('req.user 存在但无 tenantId → 403', async () => {
    mockReq.user = { userId: 1, username: 'admin', role: 'admin' }; // 无 tenantId
    await tenantMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 403, message: expect.stringContaining('Tenant ID') }),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('tenantId=0（系统管理员）→ 正常通过', async () => {
    mockReq.user = { userId: 1, username: 'admin', role: 'admin', tenantId: 0 };
    await tenantMiddleware(mockReq, mockRes, mockNext);
    expect(mockReq.tenantId).toBe(0);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  test('tenantId=1 → 正常通过', async () => {
    mockReq.user = { userId: 1, username: 'admin', role: 'admin', tenantId: 1 };
    await tenantMiddleware(mockReq, mockRes, mockNext);
    expect(mockReq.tenantId).toBe(1);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  test('tenantId=null → 403', async () => {
    mockReq.user = { userId: 1, username: 'admin', role: 'admin', tenantId: null };
    await tenantMiddleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });
});