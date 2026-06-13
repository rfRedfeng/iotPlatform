import mqtt from 'mqtt';

class MqttAdapter {
  constructor() {
    this.client = null;
    this.messageHandler = null;
  }

  // 连接 MQTT Broker
  async connect(brokerUrl, options = {}) {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, {
        clientId: options.clientId || `iot_${Math.random().toString(16).slice(2, 10)}`,
        username: options.username,
        password: options.password,
        keepalive: options.keepalive || 60,
        reconnectPeriod: options.reconnectPeriod || 5000,
        ...options
      });

      this.client.on('connect', () => {
        console.log('MQTT connected to:', brokerUrl);
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('MQTT connection error:', error.message);
        reject(error);
      });

      this.client.on('message', (topic, payload) => {
        if (this.messageHandler) {
          this.messageHandler(topic, payload.toString());
        }
      });

      this.client.on('offline', () => {
        console.log('MQTT client offline');
      });

      this.client.on('reconnect', () => {
        console.log('MQTT reconnecting...');
      });
    });
  }

  // 订阅主题
  async subscribe(topic, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not connected'));
        return;
      }

      this.client.subscribe(topic, { qos: options.qos || 1 }, (error) => {
        if (error) {
          console.error('MQTT subscribe error:', error.message);
          reject(error);
        } else {
          console.log('MQTT subscribed to:', topic);
          resolve();
        }
      });
    });
  }

  // 取消订阅
  async unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not connected'));
        return;
      }

      this.client.unsubscribe(topic, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log('MQTT unsubscribed from:', topic);
          resolve();
        }
      });
    });
  }

  // 发布消息
  async publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not connected'));
        return;
      }

      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      this.client.publish(topic, payload, { qos: options.qos || 1 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // 注册消息处理回调
  onMessage(callback) {
    this.messageHandler = callback;
  }

  // 断开连接
  async disconnect() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          console.log('MQTT disconnected');
          this.client = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // 检查连接状态
  isConnected() {
    return this.client && this.client.connected;
  }
}

export default new MqttAdapter();