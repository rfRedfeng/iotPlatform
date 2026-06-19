// WebSocket 适配器
import JsonParser from '../parsers/JsonParser.js';

class WebSocketAdapter {
  constructor() {
    this.server = null;
    this.clients = new Map();
    this.messageHandler = null;
    this.connectionHandler = null;
    this.disconnectionHandler = null;
  }

  // 使用 JsonParser 解析数据
  static parseData(rawData) {
    try {
      const str = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      return JsonParser.parse(str);
    } catch (e) {
      console.error('[WebSocketAdapter] JSON 解析失败:', e.message);
      return null;
    }
  }

  // 启动 WebSocket 服务器
  async listen(port, host = '0.0.0.0') {
    const { WebSocketServer } = await import('ws');

    return new Promise((resolve, reject) => {
      try {
        this.server = new WebSocketServer({ host, port });

        this.server.on('listening', () => {
          console.log(`WebSocket server listening on ${host}:${port}`);
          resolve();
        });

        this.server.on('connection', (ws, req) => {
          const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
          console.log(`WebSocket client connected: ${clientId}`);

          this.clients.set(clientId, ws);

          if (this.connectionHandler) {
            this.connectionHandler(clientId, ws, req);
          }

          // 接收消息
          ws.on('message', (data) => {
            if (this.messageHandler) {
              const parsed = WebSocketAdapter.parseData(data);
              if (parsed) {
                this.messageHandler(clientId, parsed, data.toString());
              }
            }
          });

          // 客户端断开
          ws.on('close', () => {
            console.log(`WebSocket client disconnected: ${clientId}`);
            this.clients.delete(clientId);
            if (this.disconnectionHandler) {
              this.disconnectionHandler(clientId);
            }
          });

          // 错误处理
          ws.on('error', (error) => {
            console.error(`WebSocket client error (${clientId}):`, error.message);
          });
        });

        this.server.on('error', (error) => {
          console.error('WebSocket server error:', error.message);
          reject(error);
        });
      } catch (error) {
        console.error('Failed to create WebSocket server:', error.message);
        reject(error);
      }
    });
  }

  // 发送消息到指定客户端
  async sendTo(clientId, data) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
      return new Promise((resolve, reject) => {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data), (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    throw new Error(`Client ${clientId} not found or not ready`);
  }

  // 广播消息到所有客户端
  async broadcast(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const promises = [];

    for (const [clientId, ws] of this.clients) {
      if (ws.readyState === 1) {
        promises.push(
          this.sendTo(clientId, payload).catch(() => { })
        );
      }
    }

    await Promise.all(promises);
  }

  // 发送消息到所有客户端（带过滤）
  async broadcastFiltered(filter, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const promises = [];

    for (const [clientId, ws] of this.clients) {
      if (ws.readyState === 1 && filter(clientId)) {
        promises.push(
          this.sendTo(clientId, payload).catch(() => { })
        );
      }
    }

    await Promise.all(promises);
  }

  // 注册消息处理回调 (clientId, message) => void
  onMessage(handler) {
    this.messageHandler = handler;
  }

  // 注册连接处理回调 (clientId, ws, request) => void
  onConnection(handler) {
    this.connectionHandler = handler;
  }

  // 注册断开连接处理回调 (clientId) => void
  onDisconnection(handler) {
    this.disconnectionHandler = handler;
  }

  // 关闭服务器
  async close() {
    return new Promise((resolve) => {
      // 关闭所有客户端连接
      for (const [clientId, ws] of this.clients) {
        ws.close();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          console.log('WebSocket server closed');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // 获取连接数
  getConnectionCount() {
    return this.clients.size;
  }

  // 获取所有客户端 ID
  getClientIds() {
    return Array.from(this.clients.keys());
  }
}

export { WebSocketAdapter };
export default new WebSocketAdapter();