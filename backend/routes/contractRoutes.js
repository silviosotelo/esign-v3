const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware());

// Rutas básicas
router.post('/', contractController.createContract);
router.get('/', contractController.getAllContracts);
router.get('/:id', contractController.getContractById);

// Rutas de usuario
router.get('/user-contracts/:id', contractController.getUserContracts);

// Ruta de administración
router.get('/admin/all', 
  authMiddleware.role('admin'), 
  contractController.adminGetContracts
);

// Firma digital
router.post('/:id/sign', contractController.signContract);

router.post('/:id/re-sign', contractController.reSignContract);

module.exports = router;