/*const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;*/

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const axios = require('axios');
require('dotenv').config();

// Carpeta de logs dentro del proyecto
const logDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Formato de logs
const { combine, timestamp, printf, colorize, errors } = winston.format;
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const base = `${timestamp} [${level}]: ${stack || message}`;
  return Object.keys(meta).length ? `${base} ${JSON.stringify(meta)}` : base;
});

// Nivel de log configurable
const level = process.env.LOG_LEVEL || 'info';

// Transports configurados
const loggerTransports = [
  // Consola con color
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    )
  }),
  // Rotación diaria de logs generales
  new DailyRotateFile({
    dirname: logDir,
    filename: '%DATE%.log',
    datePattern: 'DD-MM-YYYY',
    level: level,
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    maxFiles: '14d'
  }),
  // Rotación diaria de logs de error
  new DailyRotateFile({
    dirname: logDir,
    filename: 'error-%DATE%.log',
    datePattern: 'DD-MM-YYYY',
    level: 'error',
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      logFormat
    ),
    maxFiles: '30d'
  })
];

// Crear logger
const logger = winston.createLogger({ level, transports: loggerTransports });

// Función para notificar por WhatsApp de forma independiente
async function notifyWhatsApp(message) {
  try {
    const url = process.env.WHATSAPP_API_URL;
    const phone = process.env.WHATSAPP_API_PHONE;
    if (!url || !phone) {
      logger.error('Faltan variables de entorno para WhatsApp API');
      return;
    }
    const payload = { phone: phone, message };
    logger.info(`WhatsApp payload: ${JSON.stringify(payload)}`);
    const resp = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    logger.info(`WhatsApp enviado: status ${resp.status}`);
  } catch (err) {
    logger.error('Error enviando WhatsApp', { error: err.message });
  }
}

// Exportar logger y notifyWhatsApp por separado
module.exports = {
  logger,
  notifyWhatsApp
};
