// routes/index.js
const authRoutes = require('./authRoutes');
const contractRoutes = require('./contractRoutes');
const userRoutes = require('./userRoutes');

module.exports = {
  auth: authRoutes,
  contracts: contractRoutes,
  users: userRoutes
};