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
  // C-5: 移除 tenantId — 跨租户用户移动应走专用端点
  updatableFields: ['username', 'passwordHash', 'role', 'email']
};

export default User;