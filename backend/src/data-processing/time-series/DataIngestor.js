import TimeSeriesRepo from '../../data-access/tdengine/TimeSeriesRepo.js';

class DataIngestor {
  // 摄入设备数据到 TDengine
  async ingest(deviceId, tenantId, areaId, deviceType, metrics) {
    let res = await TimeSeriesRepo.insertDeviceDataPoint(
      deviceId,
      tenantId,
      areaId,
      deviceType,
      metrics
    );
    res = await TimeSeriesRepo.insertDeviceStatusPoint(
      deviceId,
      tenantId,
      areaId,
      deviceType,
      'online'
    );
    return res;
  }

  // 获取设备最新数据
  async getLatest(deviceId, { page = 1, pageSize = 10 } = {}) {
    return await TimeSeriesRepo.getLatestDeviceData(deviceId, { page, pageSize });
  }

  // 获取设备历史数据
  async getHistory(deviceId, startTime, endTime, { page = 1, pageSize = 10 } = {}) {
    return await TimeSeriesRepo.getDeviceDataByTimeRange(
      deviceId,
      startTime,
      endTime,
      { page, pageSize }
    );
  }

  // 批量摄入数据
  async ingestBatch(dataPoints) {
    const promises = dataPoints.map(dp =>
      this.ingest(dp.deviceId, dp.tenantId, dp.areaId, dp.deviceType, dp.metrics)
    );
    return await Promise.all(promises);
  }
}

export default new DataIngestor();