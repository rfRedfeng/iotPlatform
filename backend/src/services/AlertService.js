/**
 * 告警服务
 * 包含：告警规则 CRUD + 告警事件查询/确认
 */

import AlertRuleRepository from '../data-access/mysql/repositories/AlertRuleRepository.js';
import AlertEventRepository from '../data-access/mysql/repositories/AlertEventRepository.js';
import CacheManager from '../data-access/redis/CacheManager.js';
import { registerHandler } from './handlerRegistry.js';

const RULE_CACHE_TTL = 300;
const RULE_CACHE_PREFIX = 'service:alert:rule:';
const EVENT_CACHE_TTL = 60;

// ========== 规则读取 ==========

export async function listRules(tenantId, { page = 1, pageSize = 20 } = {}) {
  return await AlertRuleRepository.findByTenantId(tenantId, { page, pageSize });
}

export async function getRuleById(ruleId, tenantId) {
  const cacheKey = `${RULE_CACHE_PREFIX}${ruleId}`;
  const cached = await CacheManager.get(cacheKey);
  if (cached) {
    const rule = JSON.parse(cached);
    return rule.tenantId === tenantId ? rule : null;
  }

  const rule = await AlertRuleRepository.findById(ruleId);
  if (!rule || rule.tenantId !== tenantId) return null;

  await CacheManager.set(cacheKey, JSON.stringify(rule), RULE_CACHE_TTL);
  return rule;
}

// ========== 事件读取 ==========

export async function listEvents(tenantId, { page = 1, pageSize = 20 } = {}) {
  return await AlertEventRepository.findByTenantId(tenantId, { page, pageSize });
}

export async function getEventById(eventId, tenantId) {
  const event = await AlertEventRepository.findById(eventId);
  if (!event || event.tenantId !== tenantId) return null;
  return event;
}

// ========== 规则写入 ==========

async function _invalidateRuleCache(ruleId) {
  await CacheManager.del(`${RULE_CACHE_PREFIX}${ruleId}`);
}

export async function createRule(payload, task) {
  const { name, deviceId, metric, condition, threshold, durationSeconds = 0, severity = 'info', enabled = true, webhookUrl = null, tenantId } = payload;

  // 验证 severity 值
  const validSeverities = ['info', 'warn', 'error', 'critical'];
  if (!validSeverities.includes(severity)) {
    severity = 'info';
  }

  const ruleId = await AlertRuleRepository.create({
    tenantId: tenantId || task.tenantId,
    deviceId: deviceId || null,
    name,
    metric,
    condition,
    threshold,
    durationSeconds,
    severity,
    enabled,
    webhookUrl
  });

  return { id: ruleId, name, metric, condition, threshold, severity, webhookUrl };
}

export async function updateRule(payload, task) {
  const { ruleId, ...updates } = payload;
  const tenantId = task.tenantId;

  const existing = await AlertRuleRepository.findById(ruleId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Rule not found');
  }

  const result = await AlertRuleRepository.update(ruleId, updates);
  if (result) await _invalidateRuleCache(ruleId);
  return result;
}

export async function deleteRule(payload, task) {
  const { ruleId } = payload;
  const tenantId = task.tenantId;

  const existing = await AlertRuleRepository.findById(ruleId);
  if (!existing || existing.tenantId !== tenantId) {
    throw new Error('Rule not found');
  }

  const result = await AlertRuleRepository.delete(ruleId);
  if (result) await _invalidateRuleCache(ruleId);
  return result;
}

// ========== 事件确认 ==========

export async function acknowledgeEvent(payload, task) {
  const { eventId } = payload;
  const tenantId = task.tenantId;

  const event = await AlertEventRepository.findById(eventId);
  if (!event || event.tenantId !== tenantId) {
    throw new Error('Event not found');
  }

  const result = await AlertEventRepository.update(eventId, {
    acknowledged: true,
    acknowledgedBy: task.userId,
    acknowledgedAt: new Date()
  });

  return result;
}

// ========== Worker 处理器注册 ==========

registerHandler('alert.rule.create', createRule);
registerHandler('alert.rule.update', updateRule);
registerHandler('alert.rule.delete', deleteRule);
registerHandler('alert.event.ack', acknowledgeEvent);