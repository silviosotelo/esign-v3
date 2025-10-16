const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const app = require('./app');
const { initialize } = require('./config/db');
const { logger } = require('./utils/logger');

// Configuración de clúster para producción
if (cluster.isMaster && process.env.NODE_ENV === 'produccion') {
  logger.info(`Master ${process.pid} is running`);
  
  // Crear workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  // Configuración del worker
  const PORT = process.env.PORT || 4300;
  
  const startServer = async () => {
    try {
      await initialize();
      app.listen(PORT, () => {
        logger.info(`Worker ${process.pid} started on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  };

  // Manejo de cierre limpio
  const shutdown = async (signal) => {
    logger.info(`${signal} received: closing server`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
  });

  startServer();
}