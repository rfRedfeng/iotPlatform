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
    status: 'status', // 在线、离线、故障等
    lastSeen: 'last_seen',
    metadata: 'metadata', // 设备的其他元数据，JSON格式
    createdAt: 'created_at' // 创建时间
  },

  // 允许加入数据库的字段
  insertableFields: ['tenantId', 'areaId', 'name', 'deviceKey', 'deviceSecret', 'protocol', 'deviceType', 'status', 'lastSeen', 'metadata'],

  // 允许更新的字段
  updatableFields: ['areaId', 'name', 'deviceKey', 'protocol', 'deviceSecret', 'deviceType', 'status', 'lastSeen', 'metadata']

}

export default Device;