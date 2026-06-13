/**
 * handlerRegistry 测试
 * 验证所有 task type 已注册，重复注册抛出错误
 */
import { jest, describe, test, expect } from '@jest/globals';

// 导入所有服务，触发 registerHandler 调用
await import('../../src/services/DeviceService.js');
await import('../../src/services/UserService.js');
await import('../../src/services/AreaService.js');
await import('../../src/services/AlertService.js');
await import('../../src/services/AuthService.js');
await import('../../src/services/TenantService.js');

const { registerHandler, getHandler, listHandlers } = await import('../../src/services/handlerRegistry.js');

describe('handlerRegistry', () => {
  test('已知 task type 返回对应 handler', () => {
    const taskTypes = [
      'auth.register',
      'device.create', 'device.update', 'device.delete',
      'user.create', 'user.update', 'user.delete',
      'area.create', 'area.update', 'area.delete',
      'alert.rule.create', 'alert.rule.update', 'alert.rule.delete',
      'alert.event.ack',
      'tenant.create', 'tenant.update',
    ];

    for (const type of taskTypes) {
      expect(getHandler(type)).not.toBeNull();
      expect(typeof getHandler(type)).toBe('function');
    }
  });

  test('未知 task type 返回 null', () => {
    expect(getHandler('nonexistent.type')).toBeNull();
    expect(getHandler('')).toBeNull();
    expect(getHandler(null)).toBeNull();
  });

  test('listHandlers() 返回所有已注册类型', () => {
    const handlers = listHandlers();
    expect(handlers).toContain('device.create');
    expect(handlers).toContain('auth.register');
    expect(handlers.length).toBeGreaterThanOrEqual(16);
  });

  test('重复注册同一 type → 抛出错误', () => {
    const dummyHandler = () => {};
    expect(() => registerHandler('device.create', dummyHandler))
      .toThrow('Duplicate handler');
  });

  test('新 type 注册成功', () => {
    const testHandler = () => 'test';
    registerHandler('test.type', testHandler);
    expect(getHandler('test.type')).toBe(testHandler);
  });
});