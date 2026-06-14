const AlertRule = {
  tableName: 'alert_rules',

  fields: {
    id: 'id',
    tenantId: 'tenant_id', // 外键，关联租户表
    deviceId: 'device_id', // 外键，关联设备表
    name: 'name',          // 告警规则名称
    metric: 'metric',      // 监控指标，例如温度、湿度等
    condition: '`condition`',// 条件，例如大于、小于等（MySQL 保留字，必须加反引号）
    threshold: 'threshold',// 阈值
    durationSeconds: 'duration_seconds',// 持续时间，单位秒，满足条件持续多长时间才触发告警
    enabled: 'enabled', // 是否启用
    createdAt: 'created_at' // 创建时间
  },

  insertableFields: ['tenantId', 'deviceId', 'name', 'metric', 'condition', 'threshold', 'durationSeconds', 'enabled'],

  updatableFields: ['name', 'metric', 'condition', 'threshold', 'durationSeconds', 'enabled']
};

export default AlertRule;