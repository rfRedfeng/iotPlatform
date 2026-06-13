/**
 * 告警通知器
 * 负责将告警信息推送到前端界面（通过 RealtimePusher）
 * SPEC: 仅界面展示，不发送邮件/短信等外部通知
 */

import RealtimePusher from '../RealtimePusher.js';

class Notifier {
  /**
   * 发送告警通知到前端
   * @param {number} tenantId - 租户ID
   * @param {object} alertEvent - 告警事件
   */
  async notify(tenantId, alertEvent) {
    await RealtimePusher.pushAlert(tenantId, {
      id: alertEvent.id,
      deviceId: alertEvent.deviceId,
      ruleId: alertEvent.ruleId,
      ruleName: alertEvent.ruleName,
      metric: alertEvent.metric,
      triggerValue: alertEvent.triggerValue,
      triggeredAt: alertEvent.triggeredAt
    });
  }
}

export default new Notifier();