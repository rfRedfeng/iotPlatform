# IoT Cloud Platform API 接口文档

> 基于 `backend/src/routes/` 和 `frontend/scripts/api.js` 的实际实现。

---

## 1. 认证接口

### POST /api/auth/login
**登录**

```json
// Request
{ "username": "admin", "password": "xxx" }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900,
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "tenantId": 0
    }
  }
}
```

### POST /api/auth/refresh
**刷新令牌**

```json
// Request
{ "refreshToken": "eyJhbG..." }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900
  }
}
```

### GET /api/auth/userinfo
**获取当前用户信息**（需 Bearer Token）

```json
// Response 200
{
  "success": true,
  "data": {
    "user": { "id": 1, "username": "admin", "role": "admin", "tenantId": 0 },
    "tenant": { "id": 0, "name": "System" }
  }
}
```

---

## 2. 设备接口

### GET /api/devices
**获取设备列表**

```
Query: page, pageSize, areaId, status
```

```json
// Response 200
{
  "success": true,
  "data": {
    "items": [...],
    "total": 150,
    "page": 1,
    "pageSize": 20
  }
}
```

### POST /api/devices
**创建设备**（异步，202返回）

```json
// Request
{ "name": "温度传感器-001", "areaId": 1, "protocol": "mqtt", "deviceType": "temperature_sensor" }

// Response 202
{ "success": true, "taskId": "uuid-xxx" }
// 随后 WebSocket 推送 task_result
```

### GET /api/devices/:id
**获取设备详情**

```json
// Response 200
{ "success": true, "data": { "id": 1, "name": "...", "deviceKey": "dev_xxx", "status": "online", ... } }
```

### PUT /api/devices/:id
**更新设备**（异步）

```json
// Request
{ "name": "新名称", "areaId": 2 }

// Response 202 → WebSocket task_result
```

### DELETE /api/devices/:id
**删除设备**（异步）

```json
// Response 202 → WebSocket task_result
```

### POST /api/devices/:id/regenerate-secret
**重新生成密钥**（异步）

```json
// Response 202 → WebSocket task_result
{ "success": true, "taskId": "uuid", "data": { "deviceSecret": "sec_xxx" } }
```

### GET /api/devices/:id/data
**获取设备历史数据**

```json
// Response 200
{ "success": true, "data": { "deviceId": 1, "metrics": {...}, "timestamp": "..." } }
```

---

## 3. 用户接口

### GET /api/users
**获取用户列表**

```json
// Response 200
{ "success": true, "data": [{ "id": 1, "username": "admin", "role": "admin", "tenantId": 0 }] }
```

### POST /api/users
**创建用户**（异步）

```json
// Request
{ "username": "newuser", "password": "xxx", "role": "user", "email": "user@example.com" }

// Response 202 → WebSocket task_result
```

### PUT /api/users/:id
**更新用户**（异步）

```json
// Request
{ "role": "manager" }

// Response 202 → WebSocket task_result
```

### DELETE /api/users/:id
**删除用户**（异步）

```json
// Response 202 → WebSocket task_result
```

---

## 4. 区域接口

### GET /api/areas
**获取区域列表**

```
Query: tree=true|false
```

```json
// Response 200 (tree=true)
{ "success": true, "data": [{ "id": 1, "name": "1号楼", "children": [...] }] }

// Response 200 (tree=false)
{ "success": true, "data": [{ "id": 1, "name": "1号楼", "parentId": null }, ...] }
```

### POST /api/areas
**创建区域**（异步）

```json
// Request
{ "name": "1层", "code": "F0-B1", "parentId": 1 }

// Response 202 → WebSocket task_result
```

### PUT /api/areas/:id
**更新区域**（异步）

### DELETE /api/areas/:id
**删除区域**（异步）

---

## 5. 告警接口

### GET /api/alerts/rules
**获取告警规则列表**

```json
// Response 200
{ "success": true, "data": [{ "id": 1, "name": "温度告警", "metric": "temperature", "condition": "gt", "threshold": 30 }] }
```

### POST /api/alerts/rules
**创建告警规则**

```json
// Request
{ "deviceId": 1, "name": "温度过高", "metric": "temperature", "condition": "gt", "threshold": 30, "durationSeconds": 60, "enabled": true }
```

### PUT /api/alerts/rules/:id
**更新告警规则**

### DELETE /api/alerts/rules/:id
**删除告警规则**

### GET /api/alerts/events
**获取告警事件列表**

```
Query: acknowledged=true|false, deviceId, startTime, endTime
```

### PUT /api/alerts/events/:id/ack
**确认告警**

---

## 6. 仪表盘接口

### GET /api/dashboard/summary
**获取仪表盘摘要**

```
Query: areaId (可选)
```

```json
// Response 200
{
  "success": true,
  "data": {
    "totalDevices": 150,
    "onlineDevices": 120,
    "offlineDevices": 30,
    "todayAlerts": 5,
    "unacknowledgedAlerts": 2
  }
}
```

### GET /api/dashboard/trends
**获取设备指标趋势**

```
Query: deviceId, metric, startTime, endTime, interval (默认1h)
```

```json
// Response 200
{
  "success": true,
  "data": {
    "deviceId": 1,
    "metric": "temperature",
    "interval": "1h",
    "dataPoints": [
      { "timestamp": "2026-06-14T10:00:00Z", "value": 24.5 },
      { "timestamp": "2026-06-14T11:00:00Z", "value": 25.6 }
    ]
  }
}
```

---

## 7. 租户接口（仅 admin）

### GET /api/tenants
**获取租户列表**

### POST /api/tenants
**创建租户**（异步）

### PUT /api/tenants/:id
**更新租户**（异步）

### DELETE /api/tenants/:id
**删除租户**（异步）

---

## 8. WebSocket 消息

### 客户端 → 服务端

**连接时鉴权**（可选冗余）：
```json
{ "type": "auth", "refreshToken": "eyJhbG..." }
```

### 服务端 → 客户端

**设备数据**：
```json
{ "type": "device_data", "deviceId": 1, "metrics": {"temperature": 25.6}, "timestamp": "..." }
```

**设备状态**：
```json
{ "type": "device_status", "deviceId": 1, "status": "online", "timestamp": "..." }
```

**告警**：
```json
{ "type": "alert", "id": 1, "deviceId": 1, "ruleName": "温度告警", "triggerValue": 35.2, "timestamp": "..." }
```

**异步任务结果**：
```json
{ "type": "task_result", "taskId": "uuid", "status": "success", "taskType": "device.create", "data": {...}, "processedAt": "..." }
```

---

*文档版本: v1.0*
*生成日期: 2026-06-14*