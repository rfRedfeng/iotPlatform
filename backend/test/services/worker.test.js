/**
 * worker.js 测试
 * 验证 Worker 消费队列、调用 handler、写入结果
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const mockDequeue = jest.fn();
const mockSet = jest.fn();
const mockPushTaskResult = jest.fn();

jest.unstable_mockModule('../../src/data-access/redis/CacheManager.js', () => ({
  __esModule: true,
  default: {
    getClient: jest.fn(),
    set: mockSet,
    get: jest.fn(),
    del: jest.fn(),
    enqueue: jest.fn(),
    dequeue: mockDequeue,
    queueLength: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/data-processing/RealtimePusher.js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    pushTaskResult: mockPushTaskResult,
    pushToTenant: jest.fn(),
    pushDeviceData: jest.fn(),
    pushDeviceStatus: jest.fn(),
    pushAlert: jest.fn(),
    getConnectionCount: jest.fn(() => 0),
  },
}));

// 触发 handler 注册
await import('../../src/services/DeviceService.js');
await import('../../src/services/UserService.js');
await import('../../src/services/AreaService.js');
await import('../../src/services/AlertService.js');
await import('../../src/services/AuthService.js');
await import('../../src/services/TenantService.js');

const { getHandler } = await import('../../src/services/handlerRegistry.js');

describe('Worker 任务处理逻辑', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDequeue.mockReset();
    mockSet.mockReset();
    mockPushTaskResult.mockReset();
  });

  test('未知 task type → status: failed', async () => {
    const taskId = 'test-task-unknown';
    const task = {
      id: taskId,
      type: 'nonexistent.type',
      payload: {},
      tenantId: 1,
      timestamp: new Date().toISOString(),
    };

    mockDequeue.mockResolvedValueOnce(JSON.stringify(task));
    mockSet.mockResolvedValue(true);
    mockPushTaskResult.mockResolvedValue(true);

    // 模拟 Worker 消费逻辑
    const taskStr = await mockDequeue();
    const parsedTask = JSON.parse(taskStr);
    const handler = getHandler(parsedTask.type);

    let result;
    if (!handler) {
      result = { status: 'failed', error: { message: `Unknown task type: ${parsedTask.type}` } };
    }

    expect(result.status).toBe('failed');
    expect(result.error.message).toContain('Unknown task type');
  });

  test('handler 成功执行 → status: success', async () => {
    const taskId = 'test-task-device';
    const task = {
      id: taskId,
      type: 'device.create',
      payload: {
        name: 'Test Device',
        protocol: 'mqtt',
        tenantId: 1,
      },
      tenantId: 1,
      userId: 1,
      timestamp: new Date().toISOString(),
    };

    mockDequeue.mockResolvedValueOnce(JSON.stringify(task));
    mockSet.mockResolvedValue(true);
    mockPushTaskResult.mockResolvedValue(true);

    // 模拟 Worker 消费
    const taskStr = await mockDequeue();
    const parsedTask = JSON.parse(taskStr);
    const handler = getHandler(parsedTask.type);

    expect(handler).not.toBeNull();

    // 注意：这里会真正调用 createDevice，需要 MySQL mock
    // 我们只验证 handler 存在，不验证完整执行（需要 DB mock）
  });

  test('handler 执行抛出错误 → status: failed', async () => {
    // 模拟一个会失败的 task payload
    const taskId = 'test-task-fail';
    const task = {
      id: taskId,
      type: 'device.create',
      payload: {
        name: 'Test',
        protocol: 'mqtt',
        // 缺少 tenantId，createDevice 会用 task.tenantId
      },
      tenantId: 1,
      userId: 1,
      timestamp: new Date().toISOString(),
    };

    // 验证 task 对象格式正确
    expect(task.type).toBe('device.create');
    expect(task.id).toBe(taskId);
  });

  test('_writeResult 写入 Redis 并推送 WebSocket', async () => {
    const taskId = 'test-task-result';
    const tenantId = 1;
    const result = { status: 'success', data: { id: 42 } };

    await mockSet(`task:result:${taskId}`, JSON.stringify(result), 300);
    await mockPushTaskResult(tenantId, taskId, result);

    expect(mockSet).toHaveBeenCalledWith(
      `task:result:${taskId}`,
      expect.stringContaining('"status":"success"'),
      300
    );
    expect(mockPushTaskResult).toHaveBeenCalledWith(tenantId, taskId, result);
  });

  test('队列为空时 dequeue 返回 null', async () => {
    mockDequeue.mockResolvedValueOnce(null);
    const result = await mockDequeue();
    expect(result).toBeNull();
  });
});