/**
 * 任务处理器注册表
 * 共享的 handler 字典，所有 Service 导入此模块进行注册
 */

const handlers = {};

export function registerHandler(type, handler) {
  if (handlers[type]) {
    console.warn(`[HandlerRegistry] Handler "${type}" 已存在，将被覆盖`);
  }
  handlers[type] = handler;
}

export function getHandler(type) {
  return handlers[type] || null;
}

export function listHandlers() {
  return Object.keys(handlers);
}