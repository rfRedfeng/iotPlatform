# 数据处理流水线实现计划

## 概述

实现 SPEC.md 3.2 节定义的数据处理层，负责：**协议适配 → 数据解析 → 缓存管理 → 告警分析 → 时序数据处理**

## 数据流向

```
设备数据 → 协议适配器 → 数据解析器 → 缓存层 → 告警评估 → 时序存储
                ↓
           数据验证 (格式、范围、完整性)
```

## 已完成

| 组件 | 状态 |
|------|------|
| cache/DeviceCache.js | ✓ 完成 |
| cache/MetricCache.js | ✓ 完成 |
| cache/AlertCache.js | ✓ 完成 |

## 待实现

| 组件 | 文件 |
|------|------|
| parsers | JsonParser, BinaryParser |
| time-series | DataIngestor |
| alert-engine | RuleEvaluator, AlertLogger |
| protocol-adapters | MqttAdapter, TcpAdapter, UdpAdapter, CoapAdapter |
| DataPipeline | DataPipeline.js |

## 架构决策

1. **协议适配器统一接口**：所有适配器暴露 `connect()`, `disconnect()`, `onMessage(callback)` 接口
2. **解析器策略模式**：根据设备协议类型选择对应解析器
3. **流水线可插拔**：DataPipeline 支持添加/移除处理阶段

---

## 任务列表

### Phase 1: 解析器 + 时序数据摄入

#### Task 1: 实现 JsonParser
- **描述**: 创建 JSON 数据解析器，将设备原始 JSON 数据转为统一对象格式
- **接受条件**:
  - [ ] 输入 `'{"temperature": 25.6, "humidity": 60}'` 返回 `{ temperature: 25.6, humidity: 60 }`
  - [ ] 输入无效 JSON 抛出 ValidationError
  - [ ] 支持嵌套对象解析
- **验证**: `node -e "const p = require('./JsonParser'); console.log(p.parse('{\"a\":1}'))"`
- **依赖**: 无
- **文件**: `data-processing/parsers/JsonParser.js`

#### Task 2: 实现 BinaryParser
- **描述**: 创建二进制协议解析器，支持固定头+长度+数据的协议格式
- **接受条件**:
  - [ ] 输入 Buffer 解析为 { metric, value } 对象
  - [ ] 支持多种二进制格式定义
  - [ ] 输入格式错误抛出 ValidationError
- **验证**: `node -e "const p = require('./BinaryParser'); console.log(p.parse(buffer))"`
- **依赖**: Task 1
- **文件**: `data-processing/parsers/BinaryParser.js`

#### Task 3: 实现 DataIngestor
- **描述**: 时序数据摄入器，封装 TimeSeriesRepo 调用
- **接受条件**:
  - [ ] `ingest(deviceId, tenantId, areaId, deviceType, metrics)` 方法存在
  - [ ] 自动调用 TimeSeriesRepo.insertDeviceDataPoint
  - [ ] 返回 Promise
- **验证**: 单元测试验证与 TimeSeriesRepo 交互正确
- **依赖**: TimeSeriesRepo 已实现
- **文件**: `data-processing/time-series/DataIngestor.js`

### Checkpoint: Phase 1 完成后
- [ ] JsonParser 可正确解析标准 JSON
- [ ] BinaryParser 可解析二进制数据
- [ ] DataIngestor 可写入 TDengine

---

### Phase 2: 告警引擎

#### Task 4: 实现 RuleEvaluator
- **描述**: 告警规则评估器，根据规则检查指标是否触发告警
- **接受条件**:
  - [ ] `evaluate(deviceId, metrics)` 方法存在
  - [ ] 支持 gt, lt, eq, gte, lte 条件判断
  - [ ] 触发告警时调用 AlertLogger
  - [ ] 从 AlertRuleRepository 获取规则
- **验证**: 模拟规则 `metric: temperature, condition: gt, threshold: 30`，输入 `{temperature: 35}` 应触发
- **依赖**: Task 1, Task 3
- **文件**: `data-processing/alert-engine/RuleEvaluator.js`

#### Task 5: 实现 AlertLogger
- **描述**: 告警日志记录器，将触发的告警写入数据库
- **接受条件**:
  - [ ] `log(ruleId, deviceId, triggerValue)` 方法存在
  - [ ] 调用 AlertEventRepository.insert
  - [ ] 记录 triggeredAt 时间戳
- **验证**: 触发告警后数据库有对应记录
- **依赖**: Task 4
- **文件**: `data-processing/alert-engine/AlertLogger.js`

### Checkpoint: Phase 2 完成后
- [ ] 告警规则可被正确评估
- [ ] 触发告警后事件写入数据库

---

### Phase 3: 协议适配器

#### Task 6: 实现 MqttAdapter
- **描述**: MQTT 协议适配器，连接 MQTT Broker 接收设备数据
- **接受条件**:
  - [ ] `connect(brokerUrl)` 方法连接 broker
  - [ ] `subscribe(topic)` 订阅主题
  - [ ] `onMessage(callback)` 注册消息回调
  - [ ] `disconnect()` 断开连接
- **验证**: 连接测试 broker 可收到消息
- **依赖**: Task 1
- **文件**: `data-processing/protocol-adapters/MqttAdapter.js`

#### Task 7: 实现 TcpAdapter
- **描述**: TCP 协议适配器，监听 TCP 端口接收设备数据
- **接受条件**:
  - [ ] `listen(port)` 启动 TCP 服务器
  - [ ] `onConnection(callback)` 新连接回调
  - [ ] `onMessage(callback)` 消息回调
  - [ ] `close()` 关闭服务器
- **验证**: telnet 连接可建立
- **依赖**: Task 1
- **文件**: `data-processing/protocol-adapters/TcpAdapter.js`

### Checkpoint: Phase 3 完成后
- [ ] MqttAdapter 可连接 Broker 并接收消息
- [ ] TcpAdapter 可监听端口并接收数据

---

### Phase 4: 数据流水线核心

#### Task 8: 实现 DataPipeline
- **描述**: 数据处理流水线，协调各组件工作
- **接受条件**:
  - [ ] `process(deviceId, rawData, protocol)` 主入口方法
  - [ ] 按顺序调用: 解析器 → 缓存 → 告警评估 → 时序存储
  - [ ] 支持添加/移除处理阶段 (插件化)
  - [ ] 错误处理，单阶段失败不影响后续
- **验证**: 端到端测试: 原始数据 → 最终存入 TDengine
- **依赖**: Task 1-7 全部完成
- **文件**: `data-processing/DataPipeline.js`

### Checkpoint: Phase 4 完成后
- [ ] DataPipeline.process() 可处理完整流程
- [ ] 各阶段正确串联

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| TDengine 连接不稳定 | 高 | DataIngestor 添加重试机制 |
| 协议适配器阻塞 | 中 | 使用异步处理，消息队列缓冲 |
| 告警风暴 | 中 | 添加触发间隔限制 |

## 开放问题

1. **二进制协议格式**：具体协议格式未定义，BinaryParser 需后续根据实际设备协议实现
2. **UDP/CoAP 是否优先实现**：当前 MVP 可先只实现 MQTT + TCP
3. **告警通知方式**：Notifier（通知器）暂定仅界面展示，是否需要 WebSocket 推送？

## 实现顺序建议

```
JsonParser → DataIngestor → RuleEvaluator → AlertLogger → MqttAdapter → DataPipeline
```

理由：
1. JsonParser 是最基础的工具
2. DataIngestor 将数据写入 TDengine，是核心功能
3. RuleEvaluator + AlertLogger 实现告警功能
4. MqttAdapter 实现设备接入
5. DataPipeline 将各组件串联