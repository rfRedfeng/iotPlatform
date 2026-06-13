/**
 * 任务处理器注册表
 * 共享的 handler 字典，所有 Service 导入此模块进行注册
 */

const handlers = {};

export function registerHandler(type, handler) {
  if (handlers[type]) {
    throw new Error(`[HandlerRegistry] Duplicate handler "${type}" — cannot register twice`);
  }
  handlers[type] = handler;
}

export function getHandler(type) {
  return handlers[type] || null;
}

export function listHandlers() {
  return Object.keys(handlers);
}