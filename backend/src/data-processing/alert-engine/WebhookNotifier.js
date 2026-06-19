/**
 * Webhook 通知器
 * 负责将告警信息通过 HTTP POST 发送到指定的 webhook URL
 */

const DEFAULT_TIMEOUT = 5000; // 5秒超时
const MAX_RETRIES = 3;

class WebhookNotifier {
  /**
   * 发送 Webhook 通知
   * @param {string} webhookUrl - Webhook URL
   * @param {object} alertEvent - 告警事件
   * @param {object} rule - 告警规则
   * @returns {Promise<boolean>} 是否发送成功
   */
  async send(webhookUrl, alertEvent, rule) {
    if (!webhookUrl) {
      return false;
    }

    const payload = this._buildPayload(alertEvent, rule);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const success = await this._post(webhookUrl, payload);
        if (success) {
          console.log(`[WebhookNotifier] 发送成功: ${webhookUrl} (尝试 ${attempt}/${MAX_RETRIES})`);
          return true;
        }
      } catch (error) {
        console.error(`[WebhookNotifier] 发送失败 (尝试 ${attempt}/${MAX_RETRIES}): ${error.message}`);
        if (attempt < MAX_RETRIES) {
          // 指数退避: 1s, 2s, 4s...
          await this._sleep(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    console.error(`[WebhookNotifier] 发送最终失败: ${webhookUrl}`);
    return false;
  }

  /**
   * 构建 Webhook 负载
   */
  _buildPayload(alertEvent, rule) {
    return {
      type: 'alert',
      timestamp: new Date().toISOString(),
      alertId: alertEvent.id,
      deviceId: alertEvent.deviceId,
      tenantId: alertEvent.tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      condition: rule.condition,
      threshold: rule.threshold,
      triggerValue: alertEvent.triggerValue,
      durationSeconds: rule.durationSeconds,
      severity: rule.severity || 'info'
    };
  }

  /**
   * 发送 HTTP POST 请求
   */
  async _post(url, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'IoT-Platform-Alert/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      // 认为 2xx 状态码为成功
      if (response.ok) {
        return true;
      }

      console.warn(`[WebhookNotifier] HTTP ${response.status}: ${response.statusText}`);
      return false;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * 睡眠辅助函数
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new WebhookNotifier();
