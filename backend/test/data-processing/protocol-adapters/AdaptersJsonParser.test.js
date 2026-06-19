/**
 * Protocol Adapters JSON 解析统一化测试
 *
 * 验证所有协议适配器使用统一的 JsonParser 进行数据解析
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { TcpAdapter } from '../../../src/data-processing/protocol-adapters/TcpAdapter.js';
import { UdpAdapter } from '../../../src/data-processing/protocol-adapters/UdpAdapter.js';
import { WebSocketAdapter } from '../../../src/data-processing/protocol-adapters/WebSocketAdapter.js';
import { MqttAdapter } from '../../../src/data-processing/protocol-adapters/MqttAdapter.js';
import { CoapAdapter } from '../../../src/data-processing/protocol-adapters/CoapAdapter.js';
import { DeviceTcpServer } from '../../../src/data-processing/protocol-adapters/DeviceTcpServer.js';

describe('Protocol Adapters JsonParser 集成', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('TcpAdapter - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof TcpAdapter.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON', () => {
      const result = TcpAdapter.parseData(Buffer.from('{"temp":25.5}'));
      expect(result).toEqual({ temp: 25.5 });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = TcpAdapter.parseData(Buffer.from('invalid-json'));
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('UdpAdapter - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof UdpAdapter.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON', () => {
      const result = UdpAdapter.parseData(Buffer.from('{"humidity":65}'));
      expect(result).toEqual({ humidity: 65 });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = UdpAdapter.parseData(Buffer.from('not-json'));
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('WebSocketAdapter - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof WebSocketAdapter.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON 字符串', () => {
      const result = WebSocketAdapter.parseData('{"status":"online"}');
      expect(result).toEqual({ status: 'online' });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = WebSocketAdapter.parseData('broken-json');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('MqttAdapter - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof MqttAdapter.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON 字符串', () => {
      const result = MqttAdapter.parseData('{"power":true}');
      expect(result).toEqual({ power: true });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = MqttAdapter.parseData('invalid');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('CoapAdapter - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof CoapAdapter.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON', () => {
      const result = CoapAdapter.parseData('{"coap":"data"}');
      expect(result).toEqual({ coap: 'data' });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = CoapAdapter.parseData('not-json');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('DeviceTcpServer - JsonParser 解析', () => {
    test('parseData 方法存在', () => {
      expect(typeof DeviceTcpServer.parseData).toBe('function');
    });

    test('parseData 应正确解析有效 JSON', () => {
      const result = DeviceTcpServer.parseData('{"deviceId":1,"metrics":{"temp":25}}');
      expect(result).toEqual({ deviceId: 1, metrics: { temp: 25 } });
    });

    test('parseData 应在解析失败时返回 null', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = DeviceTcpServer.parseData('invalid-json');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
