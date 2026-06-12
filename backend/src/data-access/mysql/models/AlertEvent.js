const AlertEvent = {
  tableName: 'alert_events',

  fields: {
    id: 'id',
    tenantId: 'tenant_id',
    ruleId: 'rule_id',
    deviceId: 'device_id',
    triggerValue: 'trigger_value',
    triggeredAt: 'triggered_at',
    acknowledged: 'acknowledged',
    acknowledgedBy: 'acknowledged_by',
    acknowledgedAt: 'acknowledged_at'
  },

  insertableFields: ['ruleId', 'deviceId', 'tenantId', 'triggerValue', 'triggeredAt'],

  updatableFields: ['acknowledged', 'acknowledgedBy', 'acknowledgedAt']
};

export default AlertEvent;