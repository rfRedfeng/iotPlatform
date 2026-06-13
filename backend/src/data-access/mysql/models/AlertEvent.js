const AlertEvent = {
  tableName: 'alert_events',

  fields: {
    id: 'id',
    tenantId: 'tenant_id', // 外键，关联租户表
    ruleId: 'rule_id',    // 外键，关联告警规则表
    deviceId: 'device_id', // 外键，关联设备表
    triggerValue: 'trigger_value', // 触发告警时的监控指标值
    triggeredAt: 'triggered_at',   // 告警触发时间
    acknowledged: 'acknowledged',  // 是否已确认
    acknowledgedBy: 'acknowledged_by', // 确认人
    acknowledgedAt: 'acknowledged_at'  // 确认时间
  },

  insertableFields: ['ruleId', 'deviceId', 'tenantId', 'triggerValue', 'triggeredAt'],

  updatableFields: ['acknowledged', 'acknowledgedBy', 'acknowledgedAt']
};

export default AlertEvent;