/**
 * TimeSeriesRepo 单元测试 (C-2/C-3)
 *
 * 重点: 验证所有 entry 点的入参校验能挡住 SQL 注入
 * 做法: mock TdDengineManger.execute,确保恶意 payload 在 SQL 拼接前就被拒掉
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// 必须在 import TimeSeriesRepo 之前 mock
const mockExecute = jest.fn();
jest.unstable_mockModule('../../../src/data-access/tdengine/TdDengineManger.js', () => ({
  default: {
    execute: mockExecute,
  },
}));

const { default: TimeSeriesRepo } = await import('../../../src/data-access/tdengine/TimeSeriesRepo.js');

describe('TimeSeriesRepo - SQL injection guard (C-2/C-3)', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ column_meta: [], data: [] });
  });

  describe('getDeviceDataByTimeRange', () => {
    test('合法 startTime/endTime 通过,执行 SQL', async () => {
      await TimeSeriesRepo.getDeviceDataByTimeRange(
        1, '2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z',
        { page: 0, pageSize: 10 }
      );
      expect(mockExecute).toHaveBeenCalled();
      // 验证 SQL 中 timestamp 是被单引号包裹的(因为已经过白名单)
      const sql = mockExecute.mock.calls[0][0];
      expect(sql).toContain("'2024-01-01T00:00:00Z'");
      expect(sql).toContain("'2024-12-31T23:59:59Z'");
    });

    test('startTime 含 SQL 注入字符 → 抛 400,不调 execute', async () => {
      await expect(
        TimeSeriesRepo.getDeviceDataByTimeRange(
          1, "2024-01-01'; DROP TABLE d1;--", "2024-12-31T23:59:59Z"
        )
      ).rejects.toThrow(/Invalid startTime/);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('endTime 含 OR 注入 → 抛 400,不调 execute', async () => {
      await expect(
        TimeSeriesRepo.getDeviceDataByTimeRange(
          1, "2024-01-01T00:00:00Z", "2024-12-31' OR '1'='1"
        )
      ).rejects.toThrow(/Invalid endTime/);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('deviceId 是字符串而非数字 → 抛 400', async () => {
      await expect(
        TimeSeriesRepo.getDeviceDataByTimeRange(
          "1; DROP", "2024-01-01T00:00:00Z", "2024-12-31T23:59:59Z"
        )
      ).rejects.toThrow(/Invalid deviceId/);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('insertDeviceDataPoint', () => {
    test('合法入参通过', async () => {
      await TimeSeriesRepo.insertDeviceDataPoint(1, 1, 1, 'temperature_sensor', { temp: 25 });
      // CREATE TABLE + INSERT 两次
      expect(mockExecute).toHaveBeenCalledTimes(2);
      // table tag 中的 deviceType 应该是温度传感器
      const createSql = mockExecute.mock.calls[0][0];
      expect(createSql).toContain("'temperature_sensor'");
    });

    test('deviceType 含 SQL 注入 → 抛 400', async () => {
      await expect(
        TimeSeriesRepo.insertDeviceDataPoint(1, 1, 1, "sensor'; DROP TABLE d1;--", {})
      ).rejects.toThrow(/Invalid deviceType/);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('areaId 是字符串而非数字 → 抛 400', async () => {
      await expect(
        TimeSeriesRepo.insertDeviceDataPoint(1, 1, "1 OR 1=1", 'sensor', {})
      ).rejects.toThrow(/Invalid areaId/);
    });

    test('metrics 是 null → 抛 400', async () => {
      await expect(
        TimeSeriesRepo.insertDeviceDataPoint(1, 1, 1, 'sensor', null)
      ).rejects.toThrow(/Invalid metrics/);
    });

    test('metrics 含注入 payload 也安全(JSON 转义)', async () => {
      const evilMetrics = { msg: "Robert'); DROP TABLE students;--" };
      await TimeSeriesRepo.insertDeviceDataPoint(1, 1, 1, 'sensor', evilMetrics);
      const insertSql = mockExecute.mock.calls[1][0];
      // 验证反引号包裹,且内部单引号被转义
      expect(insertSql).toContain("\\'");
      expect(insertSql).toContain("DROP TABLE students");
      // 但单引号未闭合: 应该仍是合法字符串字面量
      const quoted = insertSql.match(/'.*'/) || [];
      expect(quoted[0]).toBeDefined();
    });
  });

  describe('insertDeviceStatusPoint', () => {
    test('status 必须在 enum 内', async () => {
      await expect(
        TimeSeriesRepo.insertDeviceStatusPoint(1, 1, 1, 'sensor', 'invalid_status')
      ).rejects.toThrow(/Invalid status/);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    test('合法 status 通过', async () => {
      await TimeSeriesRepo.insertDeviceStatusPoint(1, 1, 1, 'sensor', 'online');
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDeviceDataAggregated (I-5)', () => {
    test('合法入参 → 走 SELECT * (TDengine 3.2 不支持 JSON_EXTRACT, JS 侧 bucketing)', async () => {
      await TimeSeriesRepo.getDeviceDataAggregated(1, 'temperature', '2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z', 3600000);
      const sql = mockExecute.mock.calls[0][0];
      expect(sql).toContain('SELECT * FROM d1');
      expect(sql).toContain("'2024-01-01T00:00:00Z'");
      expect(sql).toContain("'2024-12-31T23:59:59Z'");
    });

    test('metric 含注入 → 抛 400', async () => {
      await expect(
        TimeSeriesRepo.getDeviceDataAggregated(1, "temp'; DROP --", '2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z')
      ).rejects.toThrow(/Invalid metric/);
    });
  });
});
