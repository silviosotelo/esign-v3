const logger = require('./logger');

exports.validateEnv = () => {
  const requiredEnv = [
    'ORACLE_USER',
    'ORACLE_PASSWORD',
    'ORACLE_CONNECTION_STRING',
    'JWT_SECRET',
    'FRONTEND_URL'
  ];

  const missing = requiredEnv.filter(env => !process.env[env]);

  if (missing.length > 0) {
    logger.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};