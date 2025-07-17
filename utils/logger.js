// File: utils/logger.js
// Purpose: Winston logger configuration for application logging
// Handles different log levels and file rotation

const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_FILE_PATH || './logs';
const fs = require('fs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += '\n' + JSON.stringify(meta, null, 2);
    }
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'hpcl-journey-risk',
    version: process.env.APP_VERSION || '2.0.0'
  },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: parseInt(process.env.LOG_MAX_SIZE?.replace('m', '')) * 1024 * 1024 || 10 * 1024 * 1024,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      tailable: true
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: parseInt(process.env.LOG_MAX_SIZE?.replace('m', '')) * 1024 * 1024 || 10 * 1024 * 1024,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      tailable: true
    }),
    
    // Application-specific logs
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      level: 'info',
      maxsize: parseInt(process.env.LOG_MAX_SIZE?.replace('m', '')) * 1024 * 1024 || 10 * 1024 * 1024,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      tailable: true
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create specialized loggers for different components
const createComponentLogger = (component) => {
  return {
    info: (message, meta = {}) => logger.info(message, { component, ...meta }),
    error: (message, meta = {}) => logger.error(message, { component, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { component, ...meta })
  };
};

// Specialized loggers
const apiLogger = createComponentLogger('API');
const dbLogger = createComponentLogger('DATABASE');
const authLogger = createComponentLogger('AUTH');
const routeLogger = createComponentLogger('ROUTE');
const riskLogger = createComponentLogger('RISK');

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    component: 'REQUEST'
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      component: 'RESPONSE'
    });
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Error logging helper
const logError = (error, context = {}) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
    component: 'ERROR'
  });
};

// Performance logging
const logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata,
    component: 'PERFORMANCE'
  });
};

// API rate limit logging
const logRateLimit = (identifier, endpoint, remaining) => {
  logger.warn('Rate limit approached', {
    identifier,
    endpoint,
    remaining,
    component: 'RATE_LIMIT'
  });
};

// Database operation logging
const logDBOperation = (operation, collection, duration, metadata = {}) => {
  dbLogger.info(`Database ${operation}`, {
    collection,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Security event logging
const logSecurityEvent = (event, userId, metadata = {}) => {
  logger.warn('Security event', {
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...metadata,
    component: 'SECURITY'
  });
};

module.exports = {
  logger,
  apiLogger,
  dbLogger,
  authLogger,
  routeLogger,
  riskLogger,
  requestLogger,
  logError,
  logPerformance,
  logRateLimit,
  logDBOperation,
  logSecurityEvent
};