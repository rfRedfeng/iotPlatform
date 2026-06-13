/**
 * 统一错误处理中间件
 * 所有 API 路由的错误都会流经这里
 */

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(err, req, res, next) {
  // 默认为 500
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // 开发/生产区分
  const isProduction = process.env.NODE_ENV === 'production';

  // 操作性错误（预期内的）
  if (err.isOperational) {
    statusCode = err.statusCode;
  } else {
    // 编程错误（不应该在生产暴露详情）
    console.error('[Error]', err);
    if (!isProduction) {
      message = err.message;
    } else {
      message = 'Internal server error';
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode,
      message,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}

/**
 * 404 处理（路由未匹配）
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 404,
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}