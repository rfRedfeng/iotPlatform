const Area = {
  tableName: 'areas',

  fields: {
    id: 'id',
    tenantId: 'tenant_id',
    parentId: 'parent_id',
    name: 'name',
    code: 'code',
    description: 'description',
    createdAt: 'created_at'
  },

  // 允许加入数据库的字段
  insertableFields: ['tenantId', 'parentId', 'name', 'code', 'description'],

  // 允许更新的字段
  updatableFields: ['parentId', 'name', 'code', 'description']
}

export default Area;