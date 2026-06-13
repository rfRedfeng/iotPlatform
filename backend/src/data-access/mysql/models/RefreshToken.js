const RefreshToken = {
  tableName: 'refresh_tokens',

  fields: {
    id: 'id',
    userId: 'user_id',
    token: 'token',
    expiresAt: 'expires_at',
    createdAt: 'created_at'
  },

  insertableFields: ['userId', 'token', 'expiresAt'],

  updatableFields: []
};

export default RefreshToken;