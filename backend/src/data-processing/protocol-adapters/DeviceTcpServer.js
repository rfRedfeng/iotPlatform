/**
 * TCP 设备数据上报协议 v2.0 — JSON 格式
 *
 * ── 协议格式 (每行一个 JSON 对象, UTF-8) ──
 *
 * 1. 认证:
 *    C→S: {"type":"auth","key":"<deviceKey>","secret":"<deviceSecret>"}
 *    S→C: {"type":"auth_ok","deviceId":1,"tenantId":1}
 *    S→C: {"type":"error","code":"auth_failed","message":"key/secret 不匹配"}
 *
 * 2. 上报数据:
 *    C→S: {"type":"data","payload":{...指标数据...}}
 *    S→C: {"type":"ok"}
 *    S→C: {"type":"error","code":"not_authenticated","message":"请先认证"}
 *
 * 3. 心跳:
 *    C→S: {"type":"ping"}
 *    S→C: {"type":"pong"}
 *
 * ── 安全性 ──
 * - 仅 Device Key + Secret, 无 JWT
 * - 认证失败 3 次自动断开
 * - 未认证不能发数据
 */

import net from 'net';
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

          let msg;
          try { msg = JSON.parse(line); } catch {
            reply(socket, { type: 'error', code: 'invalid_json', message: 'JSON 解析失败' });
            continue;
          }
          if (!msg || typeof msg !== 'object' || !msg.type) {
            reply(socket, { type: 'error', code: 'invalid_format', message: '缺少 type 字段' });
            continue;
          }

          try {
            switch (msg.type) {
              case 'ping':
                reply(socket, { type: 'pong' });
                break;

              case 'auth': {
                if (!msg.key || !msg.secret) {
                  reply(socket, { type: 'error', code: 'invalid_format', message: 'auth 需要 key 和 secret' });
                  authFailures++;
                  break;
                }
                const dev = await this._authenticate(msg.key, msg.secret);
                if (!dev) {
                  reply(socket, { type: 'error', code: 'auth_failed', message: 'key/secret 不匹配' });
                  authFailures++;
                  if (authFailures >= MAX_AUTH_FAILURES) {
                    reply(socket, { type: 'error', code: 'too_many_failures', message: '认证失败次数过多,断开连接' });
                    socket.end();
                  }
                  break;
                }
                device = dev;
                authFailures = 0;
                reply(socket, { type: 'auth_ok', deviceId: device.id, tenantId: device.tenantId });
                console.log(`[DeviceTCP] ${remote} 认证通过: device=${device.id} tenant=${device.tenantId}`);
                break;
              }

              case 'data': {
                if (!device) {
                  reply(socket, { type: 'error', code: 'not_authenticated', message: '请先发送 auth 认证' });
                  break;
                }
                const payload = msg.payload;
                if (!payload || typeof payload !== 'object') {
                  reply(socket, { type: 'error', code: 'invalid_format', message: 'data 需要 payload 对象' });
                  break;
                }
                if (this.dataHandler) {
                  try { await this.dataHandler(device, payload, line); } catch (e) {
                    console.error(`[DeviceTCP] handler error device=${device.id}:`, e.message);
                  }
                }
                reply(socket, { type: 'ok' });
                break;
              }

              default:
                reply(socket, { type: 'error', code: 'unknown_type', message: `未知消息类型: ${msg.type}` });
            }
          } catch (e) {
            console.error(`[DeviceTCP] ${remote} error:`, e.message);
            reply(socket, { type: 'error', code: 'internal_error', message: e.message });
          }
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

export default new DeviceTcpServer();
