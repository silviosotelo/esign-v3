const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Autenticación básica
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);

// OAuth y refresh tokens
router.post('/google', authController.googleLogin);
router.post('/refresh-token', authMiddleware.refresh, authController.refreshTokens);

// Rutas protegidas para administradores
//router.get('/admin/users',
//    authMiddleware.role('admin'),
//    authController.listUsers
//);

module.exports = router;