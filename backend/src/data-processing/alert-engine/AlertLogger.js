/**
 * 告警日志记录器
 * 负责结构化记录告警日志，用于审计和问题排查
 */

class AlertLogger {
  /**
   * 记录告警触发日志
   * @param {object} alertEvent - 告警事件
   * @param {object} rule - 告警规则
   * @param {object} metrics - 触发时的指标数据
   */
  logAlertTrigger(alertEvent, rule, metrics) {
    const logEntry = {
      type: 'ALERT_TRIGGERED',
      timestamp: new Date().toISOString(),
      tenantId: alertEvent.tenantId,
      deviceId: alertEvent.deviceId,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      triggerValue: alertEvent.triggerValue,
      durationSeconds: rule.durationSeconds,
      metrics: metrics
    };
    console.log('[AlertLogger]', JSON.stringify(logEntry));
  }

  /**
   * 记录告警确认日志
   * @param {object} alertEvent - 告警事件
   * @param {number} acknowledgedBy - 确认人用户ID
   */
  logAlertAcknowledged(alertEvent, acknowledgedBy) {
    const logEntry = {
      type: 'ALERT_ACKNOWLEDGED',
      timestamp: new Date().toISOString(),
      tenantId: alertEvent.tenantId,
      alertEventId: alertEvent.id,
      deviceId: alertEvent.deviceId,
      ruleId: alertEvent.ruleId,
      acknowledgedBy,
      acknowledgedAt: new Date().toISOString()
    };
    console.log('[AlertLogger]', JSON.stringify(logEntry));
  }

  /**
   * 记录告警规则变更日志
   * @param {string} action - 操作类型 (created/updated/deleted)
   * @param {object} rule - 告警规则
   * @param {number} operatorId - 操作人用户ID
   */
  logRuleChange(action, rule, operatorId) {
    const logEntry = {
      type: `RULE_${action.toUpperCase()}`,
      timestamp: new Date().toISOString(),
      tenantId: rule.tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      operatorId
    };
    console.log('[AlertLogger]', JSON.stringify(logEntry));
  }
}

export default new AlertLogger();