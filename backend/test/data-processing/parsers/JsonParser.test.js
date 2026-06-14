/**
 * JsonParser 单元测试 (S-12)
 */
import { describe, test, expect } from '@jest/globals';
import { JsonParser, ValidationError } from '../../../src/data-processing/parsers/JsonParser.js';

describe('JsonParser.parse', () => {
  const parser = new JsonParser();

  test('合法 JSON 字符串', () => {
    expect(parser.parse('{"a":1}')).toEqual({ a: 1 });
  });

  test('已是对象 → 直接返回', () => {
    const obj = { a: 1 };
    expect(parser.parse(obj)).toBe(obj);
  });

  test('null/空字符串 → 抛 ValidationError', () => {
    expect(() => parser.parse(null)).toThrow(ValidationError);
    expect(() => parser.parse('')).toThrow(ValidationError);
  });

  test('非法 JSON → 抛', () => {
    expect(() => parser.parse('{broken')).toThrow(ValidationError);
  });

  test('JSON 数组 → 通过 (Array 的 typeof 是 object)', () => {
    expect(parser.parse('[1,2,3]')).toEqual([1, 2, 3]);
  });
});

describe('JsonParser.extractMetrics', () => {
  const parser = new JsonParser();

  test('顶层有数字指标 → 直接返回', () => {
    expect(parser.extractMetrics({ temp: 25 })).toEqual({ temp: 25 });
  });

  test('嵌套 metrics.data → 提取最内层', () => {
    expect(parser.extractMetrics({ metrics: { data: { voltage: 220 } } })).toEqual({ voltage: 220 });
  });

  test('所有值都是对象(非基本类型) → null', () => {
    // validateMetrics 只看 number/string/boolean,嵌套对象不算有效指标
    expect(parser.extractMetrics({ nested: { a: 1 }, arr: [1, 2] })).toBeNull();
  });

  test('空对象 → null', () => {
    expect(parser.extractMetrics({})).toBeNull();
  });
});
