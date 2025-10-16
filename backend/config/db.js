const oracledb = require('oracledb');
require('dotenv').config();

//oracledb.initOracleClient({ libDir: process.env.OCI_LIB_DIR });
oracledb.initOracleClient();


const dbConfig = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECTION_STRING,
  //poolMin: process.env.DB_POOL_MIN,
  //poolMax: process.env.DB_POOL_MAX,
  //queueTimeout: process.env.DB_QUEUE_TIMEOUT
};

async function initialize() {
  await oracledb.createPool(dbConfig);
}

module.exports = { initialize, oracledb };