const { logger, notifyWhatsApp } = require('../utils/logger');
const { ValidationError } = require('express-validation');
// Remover esta línea problemática:
// const { OracleError } = require('oracledb');

// Manejar rutas no encontradas (404)
exports.notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Manejador centralizado de errores
exports.errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  let details = null;
  let error = {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  };

  // Loggear el error completo
  logger.error(error);
  notifyWhatsApp('e-Sign Error: ' + JSON.stringify(error));

  // Manejar diferentes tipos de errores
  if (err instanceof ValidationError) {
    statusCode = 422;
    message = 'Error de validación';
    details = err.details;
  } else if (err.errorNum) { // Cambiar esta línea
    // Los errores de Oracle DB tienen la propiedad errorNum
    statusCode = 503;
    message = 'Error de base de datos';
    details = {
      code: err.errorNum,
      message: err.message
    };
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Autenticación fallida';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Acceso no autorizado';
  }

  // Formato de respuesta
  const response = {
    success: false,
    error: {
      code: statusCode,
      message: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  if (details) response.error.details = details;

  res.status(statusCode).json(response);
};