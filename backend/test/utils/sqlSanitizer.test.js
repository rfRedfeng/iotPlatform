/**
 * sqlSanitizer 单元测试 (C-2/C-3)
 *
 * 重点验证: 注入字符串必须被拒掉,合法值必须通过
 */
import { describe, test, expect } from '@jest/globals';
import {
  assertIntegerId,
  assertNonNegativeInt,
  assertIsoTimestamp,
  assertEnum,
  assertPlainObject,
  escapeTdengineString,
  jsonToTdengineString,
  assertSafeIdentifier,
} from '../../src/utils/sqlSanitizer.js';

describe('assertIntegerId', () => {
  test('合法正整数通过', () => {
    expect(assertIntegerId(1, 'id')).toBe(1);
    expect(assertIntegerId('42', 'id')).toBe(42);
    expect(assertIntegerId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('0/负数/NaN/Infinity 抛 400', () => {
    expect(() => assertIntegerId(0, 'id')).toThrow(/must be a positive integer/);
    expect(() => assertIntegerId(-1, 'id')).toThrow();
    expect(() => assertIntegerId(NaN, 'id')).toThrow();
    expect(() => assertIntegerId(Infinity, 'id')).toThrow();
    expect(() => assertIntegerId(1.5, 'id')).toThrow();  // 非整数
    expect(() => assertIntegerId('abc', 'id')).toThrow();
    expect(() => assertIntegerId(null, 'id')).toThrow();
  });

  test('注入字符串被拒', () => {
    expect(() => assertIntegerId("1; DROP TABLE d1;--", 'id')).toThrow();
    expect(() => assertIntegerId("1' OR '1'='1", 'id')).toThrow();
  });
});

describe('assertNonNegativeInt', () => {
  test('0 是合法的', () => {
    expect(assertNonNegativeInt(0, 'v')).toBe(0);
  });
  test('负数抛', () => {
    expect(() => assertNonNegativeInt(-1, 'v')).toThrow();
  });
});

describe('assertIsoTimestamp', () => {
  test('合法 ISO 8601 各种格式通过', () => {
    expect(assertIsoTimestamp('2024-01-01T00:00:00Z', 't')).toBe('2024-01-01T00:00:00Z');
    expect(assertIsoTimestamp('2024-01-01T00:00:00+08:00', 't')).toBe('2024-01-01T00:00:00+08:00');
    expect(assertIsoTimestamp('2024-01-01T00:00:00.123Z', 't')).toBe('2024-01-01T00:00:00.123Z');
  });

  test('注入 payload 被拒', () => {
    expect(() => assertIsoTimestamp("2024-01-01'; DROP TABLE d1;--", 't')).toThrow();
    expect(() => assertIsoTimestamp("2024-01-01 OR 1=1", 't')).toThrow();
    expect(() => assertIsoTimestamp("2024/01/01", 't')).toThrow();
    expect(() => assertIsoTimestamp("not-a-date", 't')).toThrow();
  });

  test('非字符串抛', () => {
    expect(() => assertIsoTimestamp(123, 't')).toThrow();
    expect(() => assertIsoTimestamp(null, 't')).toThrow();
  });
});

describe('assertEnum', () => {
  test('在白名单内通过', () => {
    expect(assertEnum('mqtt', ['mqtt', 'tcp', 'udp', 'coap'], 'p')).toBe('mqtt');
  });
  test('不在白名单内抛', () => {
    expect(() => assertEnum('" OR 1=1 --', ['mqtt', 'tcp'], 'p')).toThrow();
    expect(() => assertEnum('MQTT', ['mqtt'], 'p')).toThrow();  // 大小写敏感
  });
});

describe('assertPlainObject', () => {
  test('合法对象通过', () => {
    expect(assertPlainObject({ a: 1 }, 'm')).toEqual({ a: 1 });
  });
  test('null/array/number/boolean 抛', () => {
    expect(() => assertPlainObject(null, 'm')).toThrow();
    expect(() => assertPlainObject([1, 2], 'm')).toThrow();
    expect(() => assertPlainObject(42, 'm')).toThrow();
    expect(() => assertPlainObject('str', 'm')).toThrow();
  });
});

describe('escapeTdengineString (C-2 关键)', () => {
  test('单引号被转义', () => {
    expect(escapeTdengineString("a'b", 's')).toBe("a\\'b");
  });
  test('反斜杠被转义', () => {
    expect(escapeTdengineString('a\\b', 's')).toBe('a\\\\b');
  });
  test('控制字符被转义', () => {
    expect(escapeTdengineString('a\nb\rc\0d', 's')).toBe('a\\nb\\rc\\0d');
  });
  test('注入 payload 即使被转义也不会逃逸', () => {
    // "'; DROP TABLE d1; --"
    const evil = "'; DROP TABLE d1; --";
    const safe = escapeTdengineString(evil, 's');
    // 反引号包裹时安全,不会闭合引号
    expect(`'${safe}'`).toBe("'\\'; DROP TABLE d1; --'");
    // 验证: 闭合后内部仍然是一个被引号包裹的字符串
    expect(safe).toContain("\\'");
  });
  test('超长字符串抛', () => {
    expect(() => escapeTdengineString('x'.repeat(2000), 's')).toThrow(/too long/);
  });
});

describe('jsonToTdengineString (C-2 关键)', () => {
  test('普通对象序列化并转义', () => {
    const out = jsonToTdengineString({ temp: 25.6, hum: 60 }, 'm');
    // JSON 的双引号、反斜杠都被转义 (这是正确的)
    expect(out).toContain('\\"temp\\"');
    expect(out).toContain('25.6');
  });
  test('payload 中的单引号被转义', () => {
    const out = jsonToTdengineString({ msg: "Robert'); DROP TABLE students;--" }, 'm');
    expect(out).toContain("\\'");  // 单引号被转义
  });
  test('null/array 抛', () => {
    expect(() => jsonToTdengineString(null, 'm')).toThrow();
    expect(() => jsonToTdengineString([1, 2], 'm')).toThrow();
  });
});

describe('assertSafeIdentifier', () => {
  test('合法标识符通过', () => {
    expect(assertSafeIdentifier('temperature_sensor', 't')).toBe('temperature_sensor');
    expect(assertSafeIdentifier('a-b-c_1', 't')).toBe('a-b-c_1');
  });
  test('含 SQL 特殊字符抛', () => {
    expect(() => assertSafeIdentifier("a'; DROP", 't')).toThrow();
    expect(() => assertSafeIdentifier("a b", 't')).toThrow();  // 空格
    expect(() => assertSafeIdentifier("a`b", 't')).toThrow();  // 反引号
    expect(() => assertSafeIdentifier("a/b", 't')).toThrow();
  });
});
