/**
 * 告警通知器
 * 负责将告警信息推送到前端界面（通过 RealtimePusher）和外部系统（通过 Webhook）
 */

import RealtimePusher from '../RealtimePusher.js';
import WebhookNotifier from './WebhookNotifier.js';

class Notifier {
  /**
   * 发送告警通知
   * @param {number} tenantId - 租户ID
   * @param {object} alertEvent - 告警事件
   * @param {object} rule - 告警规则（包含 webhookUrl）
   */
  async notify(tenantId, alertEvent, rule) {
    // 1. 推送到前端 WebSocket
    await RealtimePusher.pushAlert(tenantId, {
      id: alertEvent.id,
      deviceId: alertEvent.deviceId,
      ruleId: alertEvent.ruleId,
      ruleName: alertEvent.ruleName,
      metric: alertEvent.metric,
      triggerValue: alertEvent.triggerValue,
      triggeredAt: alertEvent.triggeredAt
    });

    // 2. 发送 Webhook 通知（如果有配置）
    if (rule && rule.webhookUrl) {
      // 异步发送，不阻塞主流程
      WebhookNotifier.send(rule.webhookUrl, alertEvent, rule).catch(err => {
        console.error('[Notifier] Webhook 发送异常:', err.message);
      });
    }
  }
}

export default new Notifier();