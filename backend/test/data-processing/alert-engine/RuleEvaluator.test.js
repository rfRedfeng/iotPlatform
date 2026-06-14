/**
 * RuleEvaluator 单元测试 (S-12)
 * 覆盖: 6 种 condition、durationSeconds、类型转换、metric 缺失
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDel = jest.fn();
const mockAlertEventCreate = jest.fn();

jest.unstable_mockModule('../../../src/data-access/redis/CacheManager.js', () => ({
  default: { get: (...a) => mockCacheGet(...a), set: (...a) => mockCacheSet(...a), del: (...a) => mockCacheDel(...a) },
}));
jest.unstable_mockModule('../../../src/data-access/mysql/repositories/AlertEventRepository.js', () => ({
  default: { create: (...a) => mockAlertEventCreate(...a) },
}));
jest.unstable_mockModule('../../../src/data-processing/alert-engine/Notifier.js', () => ({
  default: { notify: () => {} },
}));
jest.unstable_mockModule('../../../src/data-processing/alert-engine/AlertLogger.js', () => ({
  default: { logAlertTrigger: () => {}, logAlertAcknowledged: () => {}, logRuleChange: () => {} },
}));

const { default: RuleEvaluator } = await import('../../../src/data-processing/alert-engine/RuleEvaluator.js');

describe('RuleEvaluator.checkCondition (S-10 类型转换)', () => {
  test.each([
    ['gt', 25, 30, false], ['gt', 35, 30, true],
    ['lt', 25, 30, true],  ['lt', 35, 30, false],
    ['gte', 30, 30, true], ['gte', 29, 30, false],
    ['lte', 30, 30, true], ['lte', 31, 30, false],
    ['eq', 30, 30, true],  ['eq', 31, 30, false],
    ['ne', 30, 30, false], ['ne', 31, 30, true],
  ])('%s value=%s threshold=%s → %s', (cond, val, thresh, expected) => {
    expect(RuleEvaluator.checkCondition(cond, thresh, val)).toBe(expected);
  });

  test('字符串 "25.6" → Number 转换后比较', () => {
    expect(RuleEvaluator.checkCondition('gt', 25, '25.6')).toBe(true);
  });

  test('NaN 字符串 "abc" → false', () => {
    expect(RuleEvaluator.checkCondition('gt', 25, 'abc')).toBe(false);
  });

  test('未知 condition → false', () => {
    expect(RuleEvaluator.checkCondition('unknown', 25, 30)).toBe(false);
  });
});

describe('RuleEvaluator.evaluate', () => {
  beforeEach(() => {
    mockCacheGet.mockReset(); mockCacheSet.mockReset(); mockCacheDel.mockReset(); mockAlertEventCreate.mockReset();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(true);
  });

  test('无规则 → 空对象', async () => {
    expect(await RuleEvaluator.evaluate(1, 1, { temp: 25 }, [])).toEqual({});
  });

  test('disabled 规则 → 跳过', async () => {
    const rules = [{ id: 1, enabled: false, metric: 'temp', condition: 'gt', threshold: 30, durationSeconds: 0 }];
    expect(await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules)).toEqual({});
  });

  test('条件满足 + 无 duration → 立即触发', async () => {
    const rules = [{ id: 1, name: 'R1', enabled: true, metric: 'temp', condition: 'gt', threshold: 30, durationSeconds: 0 }];
    mockAlertEventCreate.mockResolvedValue({ id: 100, tenantId: 1 });
    const result = await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules);
    expect(result[1]).toBe(true);
    expect(mockAlertEventCreate).toHaveBeenCalledTimes(1);
  });

  test('条件不满足 → 不触发', async () => {
    const rules = [{ id: 1, name: 'R1', enabled: true, metric: 'temp', condition: 'gt', threshold: 50, durationSeconds: 0 }];
    const result = await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules);
    expect(result[1]).toBe(false);
    expect(mockAlertEventCreate).not.toHaveBeenCalled();
  });

  test('duration 未满 → 不触发', async () => {
    const rules = [{ id: 1, name: 'DR', enabled: true, metric: 'temp', condition: 'gt', threshold: 30, durationSeconds: 60 }];
    mockCacheGet.mockResolvedValue(null);
    const result = await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules);
    expect(result[1]).toBe(false);
    expect(mockCacheSet).toHaveBeenCalled();
    expect(mockAlertEventCreate).not.toHaveBeenCalled();
  });

  test('duration 已满 → 触发 + 清缓存', async () => {
    const rules = [{ id: 1, name: 'DR', enabled: true, metric: 'temp', condition: 'gt', threshold: 30, durationSeconds: 5 }];
    mockCacheGet.mockResolvedValue(String(Date.now() - 10_000));
    mockAlertEventCreate.mockResolvedValue({ id: 200, tenantId: 1 });
    const result = await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules);
    expect(result[1]).toBe(true);
    expect(mockCacheDel).toHaveBeenCalled();
    expect(mockAlertEventCreate).toHaveBeenCalledTimes(1);
  });

  test('metric 缺失 → 清除状态', async () => {
    const rules = [{ id: 1, name: 'R1', enabled: true, metric: 'humidity', condition: 'gt', threshold: 50, durationSeconds: 0 }];
    const result = await RuleEvaluator.evaluate(1, 1, { temp: 35 }, rules);
    expect(result[1]).toBe(false);
    expect(mockCacheDel).toHaveBeenCalled();
  });
});
