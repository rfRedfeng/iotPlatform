const User = {
  tableName: 'users',

  fields: {
    id: 'id',
    tenantId: 'tenant_id',
    username: 'username',
    passwordHash: 'password_hash',
    role: 'role',
    email: 'email',
    createdAt: 'created_at'
  },

  // 允许加入数据库的字段
  insertableFields: ['tenantId', 'username', 'passwordHash', 'role', 'email'],

  // 允许更新的字段
  updatableFields: ['tenantId', 'username', 'passwordHash', 'role', 'email']
};

export default User;