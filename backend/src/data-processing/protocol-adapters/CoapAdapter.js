class CoapAdapter {
  constructor() {
    this.server = null;
    this.messageHandler = null;
    this.coap = null;
  }

  // 初始化 CoAP 模块
  async _initCoap() {
    if (!this.coap) {
      try {
        this.coap = await import('coap');
      } catch (error) {
        console.warn('CoAP module not available, using stub implementation');
        this.coap = null;
      }
    }
  }

  // 启动 CoAP 服务器
  async listen(port, host = '0.0.0.0') {
    await this._initCoap();

    if (!this.coap) {
      console.warn('CoAP server not available');
      return;
    }

    return new Promise((resolve, reject) => {
      // S-7: listen 失败时清 this.server,防止后续 close() 操作空对象
      const cleanup = () => { this.server = null; };
      try {
        this.server = this.coap.createServer((req, res) => {
          console.log(`CoAP ${req.method} request from ${req.url}`);

          let data = req.payload;
          if (req.options && req.options['Content-Format']) {
            const format = req.options['Content-Format'];
            if (format === 'application/json') {
              try {
                data = JSON.parse(data.toString());
              } catch (e) { /* 解析失败保持原数据 */ }
            }
          }

          if (this.messageHandler) {
            this.messageHandler(req, res, data);
          }

          res.end('OK');
        });

        this.server.on('error', (error) => {
          console.error('CoAP server error:', error.message);
          cleanup();
          reject(error);
        });

        this.server.listen(port, host, () => {
          console.log(`CoAP server listening on ${host}:${port}`);
          resolve();
        });
      } catch (error) {
        console.error('Failed to create CoAP server:', error.message);
        cleanup();
        reject(error);
      }
    });
  }

  // 发送响应
  respondTo(request, response, payload, options = {}) {
    if (!response) {
      console.warn('No response object available');
      return;
    }

    const {
      statusCode = '2.00',
      contentFormat = 'application/json'
    } = options;

    response.statusCode = statusCode;
    response.setOption('Content-Format', contentFormat);
    response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }

  // 注册消息处理回调 (request, response, data) => void
  onMessage(handler) {
    this.messageHandler = handler;
  }

  // 创建 CoAP 请求（客户端）
  async request(options = {}) {
    await this._initCoap();

    if (!this.coap) {
      throw new Error('CoAP module not available');
    }

    return new Promise((resolve, reject) => {
      const req = this.coap.request({
        hostname: options.hostname || 'localhost',
        port: options.port || 5683,
        pathname: options.path || '/',
        method: options.method || 'GET',
        confirm: options.confirm || false
      });

      req.on('response', (res) => {
        let data = res.payload;
        if (res.options && res.options['Content-Format'] === 'application/json') {
          try {
            data = JSON.parse(data.toString());
          } catch (e) {
            console.error('Error parsing JSON:', e);
          }
        }
        resolve({ statusCode: res.statusCode, payload: data, options: res.options });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.payload) {
        req.write(typeof options.payload === 'string' ? options.payload : JSON.stringify(options.payload));
      }

      req.end();
    });
  }

  // 关闭服务器
  async close() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('CoAP server closed');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default new CoapAdapter();
