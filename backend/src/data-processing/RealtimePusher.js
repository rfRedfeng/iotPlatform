/**
 * 实时数据推送器
 * 管理 WebSocket 客户端连接，提供设备数据和告警的实时推送
 */

class RealtimePusher {
  constructor() {
    this.server = null;
    this.clients = new Map(); // tenantId -> Set of { ws, userId }
  }

  /**
   * 初始化 WebSocket 服务器（由 app.js 调用）
   *
   * 注册 'connection' 事件：每个新连接必须有 ws.user 信息（由 app.js upgrade handler 注入），
   * 否则视为未授权,直接关闭。
   * @param {object} wsServer - ws.WebSocketServer 实例
   */
  init(wsServer) {
    this.server = wsServer;
    wsServer.on('connection', (ws, request) => {
      const user = ws.user;
      if (!user || !user.tenantId) {
        console.warn('[RealtimePusher] 未鉴权的连接,直接关闭');
        try { ws.close(1008, 'unauthorized'); } catch {}
        return;
      }
      this._addClient(user.tenantId, ws, user.userId);
      console.log(`[RealtimePusher] 客户端已注册: tenant=${user.tenantId} user=${user.userId}`);

      ws.on('close', () => {
        this._removeClient(user.tenantId, ws);
        console.log(`[RealtimePusher] 客户端断开: tenant=${user.tenantId} user=${user.userId}`);
      });
    });
    console.log('RealtimePusher initialized');
  }

  /**
   * 注册客户端连接
   */
  _addClient(tenantId, ws, userId = null) {
    if (!this.clients.has(tenantId)) {
      this.clients.set(tenantId, new Set());
    }
    this.clients.get(tenantId).add({ ws, userId });
  }

  /**
   * 移除客户端连接
   */
  _removeClient(tenantId, ws) {
    const tenantClients = this.clients.get(tenantId);
    if (tenantClients) {
      for (const client of tenantClients) {
        if (client.ws === ws) {
          tenantClients.delete(client);
          break;
        }
      }
    }
  }

  /**
   * 向指定租户的所有客户端推送消息
   * @param {number} tenantId - 租户ID
   * @param {object} payload - 推送数据
   */
  async pushToTenant(tenantId, payload) {
    if (!this.server) return;
    if (tenantId === undefined || tenantId === null) return;
    const tenantClients = this.clients.get(tenantId);
    if (!tenantClients) return;

    const message = JSON.stringify(payload);
    const deadClients = [];

    for (const client of tenantClients) {
      try {
        if (client.ws.readyState === 1) { // OPEN
          client.ws.send(message);
        } else {
          deadClients.push(client);
        }
      } catch (err) {
        console.error('WebSocket send error:', err.message);
        deadClients.push(client);
      }
    }

    // 清理无效连接
    deadClients.forEach(c => tenantClients.delete(c));
  }

  /**
   * 推送设备最新指标数据
   * @param {number} tenantId - 租户ID
   * @param {string} deviceId - 设备ID
   * @param {object} metrics - 指标数据
   */
  async pushDeviceData(tenantId, deviceId, metrics) {
    await this.pushToTenant(tenantId, {
      type: 'device_data',
      deviceId,
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 推送设备状态变更
   * @param {number} tenantId - 租户ID
   * @param {string} deviceId - 设备ID
   * @param {string} status - 状态
   */
  async pushDeviceStatus(tenantId, deviceId, status) {
    await this.pushToTenant(tenantId, {
      type: 'device_status',
      deviceId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 推送告警事件
   * @param {number} tenantId - 租户ID
   * @param {object} alertEvent - 告警事件
   */
  async pushAlert(tenantId, alertEvent) {
    const payload = {
      type: 'alert',
      timestamp: new Date().toISOString()
    };
    if (alertEvent && typeof alertEvent === 'object') {
      Object.assign(payload, alertEvent);
    }
    await this.pushToTenant(tenantId, payload);
  }

  /**
   * 获取当前连接数
   */
  getConnectionCount(tenantId) {
    const clients = this.clients.get(tenantId);
    return clients ? clients.size : 0;
  }

  /**
   * 推送异步任务处理结果
   * @param {number} tenantId - 租户ID
   * @param {string} taskId - 任务ID
   * @param {object} result - 任务处理结果 { status, data, error }
   */
  async pushTaskResult(tenantId, taskId, result) {
    const payload = {
      type: 'task_result',
      taskId,
      timestamp: new Date().toISOString()
    };
    if (result && typeof result === 'object') {
      Object.assign(payload, result);
    }
    await this.pushToTenant(tenantId, payload);
  }
}

export default new RealtimePusher();