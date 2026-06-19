import CacheManager from '../../data-access/redis/CacheManager.js';
import AlertEventRep from '../../data-access/mysql/repositories/AlertEventRepository.js';
import Notifier from './Notifier.js';
import AlertLogger from './AlertLogger.js';

class RuleEvaluator {

  /**
   * 生成持续时间缓存的 key
   */
  _durationKey(deviceId, ruleId) {
    return `alert:duration:${deviceId}:${ruleId}`;
  }

  checkCondition(condition, threshold, data) {
    const value = Number(data);
    if (Number.isNaN(value)) return false;
    switch (condition) {
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'gte':
        return value >= threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      case 'ne':
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * 触发告警
   */
  async triggerAlert(tenantId, deviceId, rule, data, metrics) {
    console.log(`Alert triggered for rule ${rule.name} with data:`, data);
    const alertEvent = await AlertEventRep.create({
      tenantId,
      deviceId,
      ruleId: rule.id,
      triggerValue: data,
      triggeredAt: new Date()
    });
    // 记录日志
    AlertLogger.logAlertTrigger(alertEvent, rule, metrics);
    // 通知前端和外部系统
    await Notifier.notify(tenantId, { ...alertEvent, ruleName: rule.name, metric: rule.metric }, rule);
  }

  /**
   * 评估规则条件
   * @param {string} tenantId - 租户ID
   * @param {string} deviceId - 设备ID
   * @param {object} metrics - 已解析的指标数据对象
   * @param {Array} alertRules - 告警规则数组（由调用方传入，避免重复查询）
   * @returns {Promise<object>} 告警事件对象 { ruleId: true/false }
   */
  async evaluate(tenantId, deviceId, metrics, alertRules) {
    const alertEvents = {};

    if (!alertRules || alertRules.length === 0) {
      return alertEvents;
    }

    try {
      for (const rule of alertRules) {
        if (!rule.enabled) {
          continue;
        }

        const metricValue = metrics[rule.metric];
        if (metricValue === undefined || metricValue === null) {
          // 指标不存在，清除持续状态，避免残留
          await CacheManager.del(this._durationKey(deviceId, rule.id));
          alertEvents[rule.id] = false;
          continue;
        }

        const conditionMet = this.checkCondition(rule.condition, rule.threshold, metricValue);
        const durationKey = this._durationKey(deviceId, rule.id);

        if (conditionMet) {
          // 条件满足
          if (rule.durationSeconds && rule.durationSeconds > 0) {
            // 需要持续时间检测
            const storedTs = await CacheManager.get(durationKey);
            if (!storedTs) {
              // 条件刚满足，首次记录触发时间
              await CacheManager.set(durationKey, String(Date.now()), rule.durationSeconds + 60);
              alertEvents[rule.id] = false; // 持续时间未满足，不触发
            } else {
              // 已记录，检查是否超时
              const elapsed = (Date.now() - parseInt(storedTs)) / 1000;
              if (elapsed >= rule.durationSeconds) {
                await this.triggerAlert(tenantId, deviceId, rule, metricValue, metrics);
                await CacheManager.del(durationKey); // 清除记录，等待下次重新计时
                alertEvents[rule.id] = true;
              } else {
                alertEvents[rule.id] = false;
              }
            }
          } else {
            // 无需持续时间，立即触发
            await this.triggerAlert(tenantId, deviceId, rule, metricValue);
            alertEvents[rule.id] = true;
          }
        } else {
          // 条件不满足，清除持续时间记录
          await CacheManager.del(durationKey);
          alertEvents[rule.id] = false;
        }
      }
    } catch (error) {
      console.error('评估规则时发生错误:', error);
    }

    return alertEvents;
  }
}

export default new RuleEvaluator();