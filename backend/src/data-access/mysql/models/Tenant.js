const Tenant = {
  tableName: 'tenants',

  fields: {
    id: 'id',
    name: 'name',
    status: 'status',
    maxDevices: 'max_devices',
    maxUsers: 'max_users',
    createdAt: 'created_at'
  },

  // 允许加入数据库的字段
  insertableFields: ['name', 'status', 'maxDevices', 'maxUsers'],

  // 允许更新的字段
  updatableFields: ['name', 'status', 'maxDevices', 'maxUsers']
};

export default Tenant;