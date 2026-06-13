class ValidationError extends Error { // 自定义验证错误类
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class JsonParser {
  // 解析 JSON 字符串为对象
  parse(rawData) {
    if (!rawData) {
      throw new ValidationError('输入数据为空');
    }

    if (typeof rawData === 'object') {
      // 如果已经是对象，直接返回（支持对象直接传入）
      return rawData;
    }

    if (typeof rawData !== 'string') {
      throw new ValidationError(`输入类型无效，期望字符串，实际: ${typeof rawData}`);
    }

    try {
      const parsed = JSON.parse(rawData);

      if (typeof parsed !== 'object' || parsed === null) {
        throw new ValidationError('解析后的数据必须是对象');
      }

      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`JSON 格式无效: ${error.message}`);
    }
  }

  // 验证指标数据格式
  validateMetrics(metrics) {
    if (!metrics || typeof metrics !== 'object') {
      return false;
    }

    // 检查是否至少有一个有效指标（支持数字、字符串、布尔值）
    const validKeys = Object.keys(metrics).filter(
      key => ['number', 'string', 'boolean'].includes(typeof metrics[key])
    );

    return validKeys.length > 0;
  }

  // 从解析后的数据中提取指标（递归处理多层嵌套）
  extractMetrics(parsedData) {
    if (!parsedData || typeof parsedData !== 'object') {
      return null;
    }

    // 如果当前层有 metrics 字段且是对象，递归提取
    if (parsedData.metrics && typeof parsedData.metrics === 'object') {
      return this.extractMetrics(parsedData.metrics);
    }

    // 如果当前层有 data 字段且是对象，递归提取
    if (parsedData.data && typeof parsedData.data === 'object') {
      return this.extractMetrics(parsedData.data);
    }

    // 如果当前层有有效指标，直接返回
    if (this.validateMetrics(parsedData)) {
      return parsedData;
    }

    // 无法提取，返回 null
    return null;
  }
}

export { JsonParser, ValidationError };
export default new JsonParser();