const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

// Rutas públicas
router.post('/request-password-reset', userController.requestPasswordReset);

// Rutas protegidas
router.use(authMiddleware());

// Gestión de usuarios
router.route('/me')
    .get(userController.getCurrentUser)
    .put(userController.updateProfile)
    .delete(userController.deleteAccount);

router.route('/data')
.get(userController.getUserDataByToken);
// Administración (solo admin)
//router.route('/admin/:userId')
//    .get(authMiddleware.role('admin'), userController.getUserById)
//    .put(authMiddleware.role('admin'), userController.updateUser)
//    .delete(authMiddleware.role('admin'), userController.deleteUser);

module.exports = router;