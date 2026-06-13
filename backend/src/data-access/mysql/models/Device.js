const Device = {
  tableName: 'devices',

  fields: {
    id: 'id',
    tenantId: 'tenant_id',
    areaId: 'area_id',
    name: 'name',
    deviceKey: 'device_key',
    deviceSecret: 'device_secret',
    protocol: 'protocol',
    deviceType: 'device_type',
    status: 'status',
    lastSeen: 'last_seen',
    metadata: 'metadata',
    createdAt: 'created_at'
  },

  // 允许加入数据库的字段
  insertableFields: ['tenantId', 'areaId', 'name', 'deviceKey', 'deviceSecret', 'protocol', 'deviceType', 'status', 'lastSeen', 'metadata'],

  // 允许更新的字段
  updatableFields: ['areaId', 'name', 'deviceKey', 'protocol', 'deviceSecret', 'deviceType', 'status', 'lastSeen', 'metadata']

}

export default Device;