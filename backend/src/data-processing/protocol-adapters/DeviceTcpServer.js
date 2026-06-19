/**
 * TCP 设备数据上报协议 — 统一 JSON 格式
 *
 * 使用 JsonParser 统一解析所有设备数据
 */

import net from 'net';
import JsonParser from '../parsers/JsonParser.js';
import DeviceRepository from '../../data-access/mysql/repositories/DeviceRepository.js';

const DEFAULT_PORT = parseInt(process.env.TCP_DEVICE_PORT || '9000', 10);
const MAX_AUTH_FAILURES = 3;

function reply(socket, obj) {
  socket.write(JSON.stringify(obj) + '\n');
}

class DeviceTcpServer {
  constructor() {
    this.server = null;
    this.dataHandler = null;
  }

  // 使用 JsonParser 解析数据
  static parseData(rawData) {
    try {
      const str = rawData instanceof Buffer ? rawData.toString('utf-8') : rawData;
      return JsonParser.parse(str);
    } catch (e) {
      console.error('[DeviceTcpServer] JSON 解析失败:', e.message);
      return null;
    }
  }

  onData(handler) { this.dataHandler = handler; }

  async start(port = DEFAULT_PORT) {
    this.server = net.createServer((socket) => {
      const remote = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`[DeviceTCP] 新连接: ${remote}`);

      let device = null;
      let buffer = '';
      let authFailures = 0;

      socket.on('data', async (chunk) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;

          const parsed = DeviceTcpServer.parseData(line);
          if (!parsed) {
            reply(socket, { type: 'error', code: 'invalid_json', message: 'JSON 解析失败' });
            continue;
          }

          // 简单的设备认证: 通过 deviceKey 和 deviceSecret
          if (!device) {
            // 首次消息需要包含认证信息
            if (!parsed.deviceKey || !parsed.deviceSecret) {
              reply(socket, { type: 'error', code: 'auth_required', message: '需要 deviceKey 和 deviceSecret' });
              authFailures++;
              if (authFailures >= MAX_AUTH_FAILURES) {
                socket.end();
              }
              continue;
            }

            const dev = await this._authenticate(parsed.deviceKey, parsed.deviceSecret);
            if (!dev) {
              reply(socket, { type: 'error', code: 'auth_failed', message: 'deviceKey/deviceSecret 不匹配' });
              authFailures++;
              if (authFailures >= MAX_AUTH_FAILURES) {
                socket.end();
              }
              continue;
            }

            device = dev;
            authFailures = 0;
            reply(socket, { type: 'auth_ok', deviceId: device.id, tenantId: device.tenantId });
            console.log(`[DeviceTCP] ${remote} 认证通过: device=${device.id} tenant=${device.tenantId}`);
            continue;
          }

          // 认证后，parsed 直接作为 payload
          if (this.dataHandler) {
            try {
              await this.dataHandler(device, parsed, line);
            } catch (e) {
              console.error(`[DeviceTCP] handler error device=${device.id}:`, e.message);
            }
          }
          reply(socket, { type: 'ok' });
        }
      });

      socket.on('error', (err) => console.error(`[DeviceTCP] ${remote} 错误:`, err.message));
      socket.on('close', () => console.log(`[DeviceTCP] ${remote} 断开${device ? ' (device=' + device.id + ')' : ''}`));
      socket.setTimeout(5 * 60 * 1000);
      socket.on('timeout', () => socket.end());
    });

    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(port, '0.0.0.0', () => {
        console.log(`[DeviceTCP] JSON 协议监听 0.0.0.0:${port}`);
        resolve();
      });
    });
  }

  async _authenticate(deviceKey, deviceSecret) {
    const device = await DeviceRepository.findByDeviceKey(deviceKey);
    if (!device) return null;
    if (device.deviceSecret !== deviceSecret) return null;
    return device;
  }

  async stop() {
    if (!this.server) return;
    return new Promise(r => this.server.close(() => { console.log('[DeviceTCP] 已停止'); r(); }));
  }
}

export { DeviceTcpServer };
export default new DeviceTcpServer();
