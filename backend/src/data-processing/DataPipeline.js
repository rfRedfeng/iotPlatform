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
    // 1. 解析数据协议并提取指标
    const parsedData = JsonParser.parse(rawData);
    const metrics = JsonParser.extractMetrics(parsedData) || parsedData;

    // 2. 比对数据库中的设备信息，确认设备合法性
    const device = await DeviceRep.findById(deviceId);
    if (!device) {
      console.error(`设备 ${deviceId} 不存在`);
      return;
    }
    if (device.tenantId !== tenantId || device.areaId !== areaId || device.deviceType !== deviceType) {
      console.error(`设备 ${deviceId} 信息不匹配`);
      return;
    }
    if (device.deviceKey !== devicekey || device.deviceSecret !== deviceSecret) {
      console.error(`设备 ${deviceId} 认证失败`);
      return;
    }

    // 3. 写入数据缓存
    await MetricCache.setMetrics(deviceId, metrics);
    await DeviceCache.setStatusWithTime(deviceId, 'online');

    // 4. 将数据写入数据库
    await DeviceRep.update(deviceId, { status: 'online' });
    await DataIngestor.ingest(deviceId, tenantId, areaId, deviceType, JSON.stringify(metrics));

    // 5. 评估告警规则（传入已查询的 rules，避免重复 DB 查询）
    const alertRules = await AlertRuleRep.findByTenantIdAndDeviceId(tenantId, deviceId);
    if (alertRules && alertRules.length > 0) {
      const alertEvents = await RuleEvaluator.evaluate(tenantId, deviceId, metrics, alertRules);
      let alertnum = 0;
      for (const [ruleId, triggered] of Object.entries(alertEvents)) {
        if (triggered) {
          await AlertCache.setAlertEvent(deviceId, ruleId);
          alertnum++;
          // 推送告警到前端
          await RealtimePusher.pushAlert(tenantId, { deviceId, ruleId });
        }
      }
      if (alertnum > 0) {
        const currentAlertCount = await AlertCache.getAlertCount(tenantId);
        await AlertCache.setAlertCount(tenantId, currentAlertCount + alertnum);
      }
    }

    // 6. 实时推送数据到前端
    await RealtimePusher.pushDeviceData(tenantId, deviceId, metrics);
    await RealtimePusher.pushDeviceStatus(tenantId, deviceId, 'online');
  }
}

export default DataPipeline;