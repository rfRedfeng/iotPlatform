const AlertRule = {
  tableName: 'alert_rules',

  fields: {
    id: 'id',
    tenantId: 'tenant_id',
    deviceId: 'device_id',
    name: 'name',
    metric: 'metric',
    condition: 'condition',
    threshold: 'threshold',
    durationSeconds: 'duration_seconds',
    enabled: 'enabled',
    createdAt: 'created_at'
  },

  insertableFields: ['tenantId', 'deviceId', 'name', 'metric', 'condition', 'threshold', 'durationSeconds', 'enabled'],

  updatableFields: ['name', 'metric', 'condition', 'threshold', 'durationSeconds', 'enabled']
};

export default AlertRule;