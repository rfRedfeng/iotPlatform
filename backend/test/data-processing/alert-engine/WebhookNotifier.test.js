/**
 * WebhookNotifier 单元测试
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { default: WebhookNotifier } = await import('../../../src/data-processing/alert-engine/WebhookNotifier.js');

describe('WebhookNotifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_buildPayload', () => {
    test('应正确构建 payload 包含 severity', () => {
      const alertEvent = {
        id: 1,
        deviceId: 10,
        tenantId: 2,
        triggerValue: 38.5
      };
      const rule = {
        id: 5,
        name: '温度过高',
        metric: 'temperature',
        condition: 'gt',
        threshold: 35,
        durationSeconds: 0,
        severity: 'error'
      };

      // 使用 send 方法会调用 _buildPayload，但我们可以通过公开的接口测试
      mockFetch.mockResolvedValue({ ok: true });

      WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://example.com/webhook');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers['Content-Type']).toBe('application/json');
      const payload = JSON.parse(call[1].body);

      expect(payload.severity).toBe('error');
      expect(payload.ruleName).toBe('温度过高');
      expect(payload.triggerValue).toBe(38.5);
    });

    test('默认 severity 为 info', () => {
      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: '温度过高', metric: 'temperature', condition: 'gt', threshold: 35, durationSeconds: 0 };
      // rule 没有 severity 字段

      mockFetch.mockResolvedValue({ ok: true });

      WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);

      const call = mockFetch.mock.calls[0];
      const payload = JSON.parse(call[1].body);

      expect(payload.severity).toBe('info');
    });
  });

  describe('send', () => {
    test('webhookUrl 为空时返回 false', async () => {
      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: 'test', webhookUrl: null };

      const result = await WebhookNotifier.send(null, alertEvent, rule);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('HTTP 200 时返回 true', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: 'test', severity: 'warn' };

      const result = await WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);
      expect(result).toBe(true);
    });

    test('HTTP 4xx 时返回 false', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: 'test', severity: 'critical' };

      const result = await WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);
      expect(result).toBe(false);
    });

    test('网络错误时重试 3 次', async () => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: 'test' };

      const result = await WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 重试 3 次
    });

    test('第二次成功后返回 true', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({ ok: true });

      const alertEvent = { id: 1, deviceId: 10, tenantId: 2, triggerValue: 38.5 };
      const rule = { id: 5, name: 'test' };

      const result = await WebhookNotifier.send('https://example.com/webhook', alertEvent, rule);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
