// 缓存管理
import MetricCache from './cache/MetricCache.js';
import DeviceCache from './cache/DeviceCache.js';
import AlertCache from './cache/AlertCache.js';

// 数据协议处理
import JsonParser from './parsers/JsonParser.js';

// 时序数据库接口
import DataIngestor from './time-series/DataIngestor.js';

// mysql 数据库接口
import DeviceRep from '../data-access/mysql/repositories/DeviceRepository.js';
import AlertRuleRep from '../data-access/mysql/repositories/AlertRuleRepository.js';

// 规则处理接口
import RuleEvaluator from './alert-engine/RuleEvaluator.js';

// 实时推送
import RealtimePusher from './RealtimePusher.js';

// SQL 注入防御 (C-2/C-3)
import {
  assertIntegerId,
  assertSafeIdentifier,
  assertEnum,
} from '../utils/sqlSanitizer.js';

class DataPipeline {
  /**
   * 处理设备数据
   * @param {string} deviceId - 设备ID
   * @param {string} tenantId - 租户ID
   * @param {string} areaId - 区域ID
   * @param {string} deviceType - 设备类型
   * @param {any} rawData - 原始数据
   * @returns {Promise<void>}
   */
  async processData(deviceId, tenantId, areaId,
    devicekey, deviceSecret,
    deviceType, rawData) {
    // C-3: 入口先做白名单校验,防止协议层的脏数据进入下游 SQL 拼接
    const _deviceId = assertIntegerId(deviceId, 'deviceId');
    const _tenantId = assertIntegerId(tenantId, 'tenantId');
    const _areaId = areaId == null ? null : assertIntegerId(areaId, 'areaId');
    const _deviceType = assertSafeIdentifier(deviceType, 'deviceType');

    // 1. 解析数据协议并提取指标
    const parsedData = JsonParser.parse(rawData);
    const metrics = JsonParser.extractMetrics(parsedData) || parsedData;

    // 2. 比对数据库中的设备信息，确认设备合法性
    const device = await DeviceRep.findById(_deviceId);
    if (!device) {
      console.error(`设备 ${_deviceId} 不存在`);
      return;
    }
    if (device.tenantId !== _tenantId || device.areaId !== _areaId || device.deviceType !== _deviceType) {
      console.error(`设备 ${_deviceId} 信息不匹配`);
      return;
    }
    if (device.deviceKey !== devicekey || device.deviceSecret !== deviceSecret) {
      console.error(`设备 ${_deviceId} 认证失败`);
      return;
    }

    // 3. 写入数据缓存
    await MetricCache.setMetrics(_deviceId, metrics);
    await DeviceCache.setStatusWithTime(_deviceId, 'online');

    // 4. 将数据写入数据库
    await DeviceRep.update(_deviceId, { status: 'online' });
    // S-4: 不再预先 JSON.stringify,让 DataIngestor / TimeSeriesRepo 一次性处理
    await DataIngestor.ingest(_deviceId, _tenantId, _areaId, _deviceType, metrics);

    // 5. 评估告警规则（传入已查询的 rules，避免重复 DB 查询）
    const alertRules = await AlertRuleRep.findByTenantIdAndDeviceId(tenantId, deviceId);
    if (alertRules && alertRules.length > 0) {
      const alertEvents = await RuleEvaluator.evaluate(tenantId, deviceId, metrics, alertRules);
      let alertnum = 0;
      for (const [ruleId, triggered] of Object.entries(alertEvents)) {
        if (triggered) {
          await AlertCache.setAlertEvent(deviceId, ruleId);
          alertnum++;
          // ★ 不在这里 pushAlert —— RuleEvaluator.triggerAlert() 已通过 Notifier 推送
          // 此处只负责 Redis 计数,避免重复推送
        }
      }
      if (alertnum > 0) {
        const currentAlertCount = await AlertCache.getAlertCount(tenantId);
        await AlertCache.setAlertCount(tenantId, currentAlertCount + alertnum);
      }
    }

    // 6. 实时推送数据到前端
    await RealtimePusher.pushDeviceData(_tenantId, _deviceId, metrics);
    await RealtimePusher.pushDeviceStatus(_tenantId, _deviceId, 'online');
  }

  /**
   * TCP 协议便捷入口: 接收已认证的 device 对象 + 已解析的 metrics
   * 供 DeviceTcpServer.onData 回调使用
   */
  async processDevicePayload(device, metrics) {
    return this.processData(
      device.id, device.tenantId, device.areaId,
      device.deviceKey, device.deviceSecret,
      device.deviceType, metrics  // 直接传 JS 对象,内部会走 JsonParser.parse(object)
    );
  }
}

export default DataPipeline;