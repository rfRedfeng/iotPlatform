import net from 'net';
import JsonParser from '../parsers/JsonParser.js';

class TcpAdapter {
  constructor() {
    this.server = null;
    this.messageHandler = null;
    this.connectionHandler = null;
    this.clients = new Map();
  }

  // 使用 JsonParser 解析数据
  static parseData(rawData) {
    try {
      const str = rawData instanceof Buffer ? rawData.toString('utf-8') : rawData;
      return JsonParser.parse(str);
    } catch (e) {
      console.error('[TcpAdapter] JSON 解析失败:', e.message);
      return null;
    }
  }

  // 启动 TCP 服务器
  async listen(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`TCP client connected: ${clientId}`);

        // 保存客户端连接
        this.clients.set(clientId, socket);

        // 触发连接回调
        if (this.connectionHandler) {
          this.connectionHandler(clientId, socket);
        }

        // 接收数据
        socket.on('data', (data) => {
          if (this.messageHandler) {
            const parsed = TcpAdapter.parseData(data);
            if (parsed) {
              this.messageHandler(clientId, parsed, data);
            }
          }
        });

        // 客户端断开
        socket.on('close', () => {
          console.log(`TCP client disconnected: ${clientId}`);
          this.clients.delete(clientId);
        });

        // 错误处理
        socket.on('error', (error) => {
          console.error(`TCP client error (${clientId}):`, error.message);
        });
      });

      this.server.on('error', (error) => {
        console.error('TCP server error:', error.message);
        reject(error);
      });

      this.server.listen(port, host, () => {
        console.log(`TCP server listening on ${host}:${port}`);
        resolve();
      });
    });
  }

  // 发送数据到指定客户端
  async sendTo(clientId, data) {
    const socket = this.clients.get(clientId);
    if (socket) {
      return new Promise((resolve, reject) => {
        socket.write(data, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    throw new Error(`Client ${clientId} not found`);
  }

  // 广播数据到所有客户端
  async broadcast(data) {
    const promises = [];
    for (const [clientId, socket] of this.clients) {
      promises.push(this.sendTo(clientId, data).catch(() => {}));
    }
    await Promise.all(promises);
  }

  // 注册消息处理回调 (clientId, data) => void
  onMessage(handler) {
    this.messageHandler = handler;
  }

  // 注册连接处理回调 (clientId, socket) => void
  onConnection(handler) {
    this.connectionHandler = handler;
  }

  // 关闭服务器
  async close() {
    return new Promise((resolve) => {
      // 关闭所有客户端连接
      for (const [clientId, socket] of this.clients) {
        socket.destroy();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          console.log('TCP server closed');
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
}

export { TcpAdapter };
export default new TcpAdapter();