# TCP 设备数据上报协议 v2.0 (JSON)

## 连接参数

| 参数 | 值 |
|------|-----|
| 端口 | `9000` (环境变量 `TCP_DEVICE_PORT`) |
| 编码 | UTF-8 |
| 帧格式 | 每行一个 JSON 对象，`\n` 分隔 |
| 超时 | 5 分钟无数据断开 |
| 认证 | Device Key + Device Secret |

## 认证凭据

| 字段 | 格式 | 长度 |
|------|------|------|
| Device Key | `dev_` + 32 位 hex | 固定 **36** 字符 |
| Device Secret | `sec_` + 64 位 hex | 固定 **68** 字符 |

## 协议帧

### 心跳

```json
C→S: {"type":"ping"}
S→C: {"type":"pong"}
```

### 认证

```json
C→S: {
  "type": "auth",
  "key":   "dev_f6b9e79de4359d8a0cfc5b5bf91a44d5",
  "secret":"sec_ce0fa674ce27a4017b99a8c78c20a0e52b896aa866dd03e8289a3c2c6a22994f"
}

S→C: {"type":"auth_ok","deviceId":1,"tenantId":1}
```

认证失败:
```json
S→C: {"type":"error","code":"auth_failed","message":"key/secret 不匹配"}
S→C: {"type":"error","code":"invalid_format","message":"auth 需要 key 和 secret"}
```

连续失败 3 次自动断开:
```json
S→C: {"type":"error","code":"too_many_failures","message":"认证失败次数过多,断开连接"}
```

### 上报数据

```json
C→S: {
  "type": "data",
  "payload": {
    "temperature": 25.6,
    "humidity": 61.2
  }
}

S→C: {"type":"ok"}
```

未认证发数据:
```json
S→C: {"type":"error","code":"not_authenticated","message":"请先发送 auth 认证"}
```

## 完整示例

```text
→ {"type":"auth","key":"dev_f6b9e79de4359d8a0cfc5b5bf91a44d5","secret":"sec_ce0fa674ce27a4..."}
← {"type":"auth_ok","deviceId":1,"tenantId":1}

→ {"type":"data","payload":{"temperature":25.6,"humidity":61.2}}
← {"type":"ok"}

→ {"type":"data","payload":{"temperature":24.8,"humidity":60.5}}
← {"type":"ok"}

→ {"type":"ping"}
← {"type":"pong"}
```

## 错误码

| code | 含义 |
|------|------|
| `auth_failed` | Key 或 Secret 不匹配 |
| `not_authenticated` | 未认证先发数据 |
| `invalid_json` | JSON 解析失败 |
| `invalid_format` | 缺少必填字段 |
| `too_many_failures` | 连续 3 次认证失败 |
| `unknown_type` | 未知 type 值 |
| `internal_error` | 服务端内部错误 |

## 安全设计

- 仅 Device Key + Secret，不经过 HTTP/JWT
- 凭据仅通过 TCP 传输
- 认证失败 3 次自动断开
- Secret 支持重新生成（旧凭据立即失效）
