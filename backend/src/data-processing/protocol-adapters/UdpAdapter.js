import dgram from 'dgram';

class UdpAdapter {
  constructor() {
    this.server = null;
    this.messageHandler = null;
  }

  // 启动 UDP 服务器
  async listen(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.server = dgram.createSocket('udp4');

      this.server.on('error', (error) => {
        console.error('UDP server error:', error.message);
        reject(error);
      });

      this.server.on('message', (data, rinfo) => {
        if (this.messageHandler) {
          this.messageHandler(rinfo, data);
        }
      });

      this.server.on('listening', () => {
        const address = this.server.address();
        console.log(`UDP server listening on ${address.address}:${address.port}`);
        resolve();
      });

      this.server.bind(port, host);
    });
  }

  // 发送数据到指定地址
  async sendTo(host, port, data) {
    if (!this.server) {
      throw new Error('UDP server not started');
    }

    const message = typeof data === 'string' ? Buffer.from(data) : data;
    return new Promise((resolve, reject) => {
      this.server.send(message, port, host, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  // 注册消息处理回调 (rinfo, data) => void
  // rinfo: { address, family, port, size }
  onMessage(handler) {
    this.messageHandler = handler;
  }

  // 关闭服务器
  async close() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('UDP server closed');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // 获取服务器地址
  getAddress() {
    return this.server ? this.server.address() : null;
  }
}

export default new UdpAdapter();