const contractService = require('../services/contractService');
const userService = require('../services/userService');
const { generateSignature } = require('../utils/signatureUtils');
const { handleServiceError } = require('../utils/errorHandler');

exports.createContract = async (req, res) => {
  try {
    const { email, ci, title, content, file_path, file_mimetype, file_name } = req.body;
    //const userId = req.user.id; // Obtenido del middleware de autenticación
    //const userId = await userService.findUserByEmail(email);
    const userId = await userService.findUserByCi(ci);
    if (!userId) throw new Error('Usuario no encontrado con ci: ' + ci);
    console.log('userId: ', userId);
    const contract = await contractService.createContract(userId.ID, { title, content, file_path, file_mimetype, file_name });
    //res.status(201).json(contract);
    res.status(201).json({
      success: true,
      message: 'Contract registered successfully',
      contractId: contract
    });
  } catch (error) {
    console.log('Error al crear el contrato: ', error);
    handleServiceError(error, res);
  }
};

exports.getAllContracts = async (req, res) => {
  try {
    const contracts = await contractService.getUserContracts(req.params.id);
    res.status(200).json(contracts);
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.getContractById = async (req, res) => {
  try {
    const contract = await contractService.getContractById(req.params.id);
    res.status(200).json(contract);
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.getUserContracts = async (req, res) => {
  try {
    const contracts = await contractService.getUserContracts(req.params.id);
    res.status(200).json(contracts);
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.signContract = async (req, res) => {
  try {
    const { id: contractId } = req.params;
    const { passphrase } = req.body;
    const clientIp = req.clientIp || req.ip || '0.0.0.0';
    
    // Crear objeto de parámetros con verificaciones
    const params = {
      contractId: contractId,
      userId: req.user.id,
      userIp: req.body.ip || clientIp,
      passphrase: passphrase || {}
    };
      
    const signedContract = await contractService.signContract(
      params.contractId, 
      params.userId, 
      params.userIp, 
      params.passphrase
    );

    res.status(200).json(signedContract);
  } catch (error) {
    console.error('signContract error:', error);
    handleServiceError(error, res);
  }
};

exports.reSignContract = async (req, res) => {
  try {
    const { id: contractId } = req.params;
    const { ci, type, ip, passphrase } = req.body;
    const clientIp = req.clientIp;

    const params = {
      ci: ci,
      userId: req.user.id,
      type: type,
      userIp: ip || clientIp,
      signature: passphrase
    };

    const signedContract = await contractService.addSignatureToContract(contractId, params);

    res.status(200).json(signedContract);
  } catch (error) {
    console.log('reSignContract error: ', error);
    handleServiceError(error, res);
  }
};

// Nuevo método para administración
exports.adminGetContracts = async (req, res) => {
  try {
    const contracts = await contractService.getAllContractsDetailed();
    res.status(200).json(contracts);
  } catch (error) {
    handleServiceError(error, res);
  }
};