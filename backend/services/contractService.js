const ContractRepository = require('../repositories/contractRepository');
const UserRepository = require('../repositories/userRepository');
const cryptographicService = require('./cryptographicService');
const documentIntegrityService = require('./documentIntegrityService');
const documentStorageService = require('./documentStorageService');
const auditService = require('./auditService');
const cacheService = require('./cacheService');
const queueService = require('./queueService');
const metricsService = require('./metricsService');
const { PDFDocument: PDFLibDocument, rgb } = require('pdf-lib');
const dateUtils = require('../utils/dateUtils');
const logger = require('../utils/logger');

class ContractService {
  constructor() {
    this.registerQueueWorkers();
  }

  registerQueueWorkers() {
    queueService.registerWorker('pdf-generation', async (data) => {
      return await this.generateSignedPDFWorker(data);
    });

    queueService.registerWorker('document-compression', async (data) => {
      return await documentStorageService.compressDocument(
        data.documentBuffer,
        data.algorithm
      );
    });

    queueService.registerWorker('integrity-verification', async (data) => {
      return await documentIntegrityService.verifyDocumentChain(data.contractId);
    });
  }

  async createContract(userId, { title, content, file_path, file_mimetype, file_name }, ipAddress = null) {
    const startTime = Date.now();

    try {
      const user = await UserRepository.findUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      const userPassphrase = {
        id: user.ID,
        email: user.EMAIL,
        document: user.DOCUMENT
      };

      const { publicKey, keyId } = await cryptographicService.generateKeyPair(userPassphrase);

      metricsService.recordDocumentCreated(Buffer.byteLength(content));

      const contractId = await ContractRepository.create({
        userId,
        title,
        content,
        file_path,
        file_mimetype,
        file_name,
        status: 'PENDIENTE',
        publicKey,
        keyId
      });

      await auditService.logDocumentCreation(
        userId,
        contractId,
        ipAddress,
        { title, file_name, keyId }
      );

      await cacheService.invalidate('contracts', `user:${userId}`);

      const duration = Date.now() - startTime;
      metricsService.recordRequest('/contracts/create', 'POST', duration, true);

      logger.info(`Contrato creado: ${contractId} para usuario ${userId}`);

      return contractId;
    } catch (error) {
      metricsService.recordError(error, 'contract_creation');
      logger.error('Error creando contrato:', error);
      throw error;
    }
  }

  async getUserContracts(userId, useCache = true) {
    const startTime = Date.now();

    try {
      if (useCache) {
        const cached = await cacheService.getCachedUserContracts(userId);
        if (cached) {
          metricsService.recordCacheHit();
          metricsService.recordRequest('/contracts/list', 'GET', Date.now() - startTime, true);
          return cached;
        }
        metricsService.recordCacheMiss();
      }

      const contracts = await ContractRepository.findByUserId(userId);

      if (useCache) {
        await cacheService.cacheUserContracts(userId, contracts, 300);
      }

      const duration = Date.now() - startTime;
      metricsService.recordRequest('/contracts/list', 'GET', duration, true);

      return contracts;
    } catch (error) {
      metricsService.recordError(error, 'contract_list');
      throw error;
    }
  }

  async getContractById(contractId, useCache = true) {
    const startTime = Date.now();

    try {
      if (useCache) {
        const cached = await cacheService.getCachedContract(contractId);
        if (cached) {
          metricsService.recordCacheHit();
          metricsService.recordRequest('/contracts/get', 'GET', Date.now() - startTime, true);
          return cached;
        }
        metricsService.recordCacheMiss();
      }

      const contract = await ContractRepository.findById(contractId);

      if (useCache && contract) {
        await cacheService.cacheContract(contractId, contract, 600);
      }

      const duration = Date.now() - startTime;
      metricsService.recordRequest('/contracts/get', 'GET', duration, true);

      return contract;
    } catch (error) {
      metricsService.recordError(error, 'contract_get');
      throw error;
    }
  }

  async signContract(contractId, userId, ipAddress, passphrase) {
    const startTime = Date.now();

    try {
      const contract = await this.getContractById(contractId, false);

      if (!contract) {
        throw new Error('Contrato no encontrado');
      }

      if (contract.STATUS === 'FIRMADO') {
        throw new Error('El contrato ya está firmado');
      }

      if (contract.STATUS === 'RECHAZADO') {
        throw new Error('Un contrato rechazado no puede ser firmado');
      }

      const user = await UserRepository.findUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      const userPassphrase = {
        id: user.ID,
        email: user.EMAIL,
        document: user.DOCUMENT
      };

      const signedAtLocal = dateUtils.getCurrentDateInTimezone();

      const dataToSign = {
        contractId: contract.ID,
        userId: user.ID,
        email: user.EMAIL,
        document: user.DOCUMENT,
        name: user.NAME,
        type: 'CLIENTE',
        date: signedAtLocal.toISOString(),
        ip: ipAddress
      };

      const signatureStart = Date.now();
      const signatureResult = await cryptographicService.signData(
        Buffer.from(JSON.stringify(dataToSign)),
        contract.KEY_ID,
        userPassphrase,
        userId
      );
      metricsService.recordSignatureGenerated(Date.now() - signatureStart);

      const signatureData = {
        userId: user.ID,
        name: user.NAME,
        email: user.EMAIL,
        document: user.DOCUMENT,
        type: 'CLIENTE',
        ip: ipAddress,
        signedAt: signedAtLocal.toISOString(),
        keyId: contract.KEY_ID,
        signatureImage: null,
        digitalSignature: signatureResult.signature
      };

      let additionalSignatures = [];
      if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
        additionalSignatures = [...contract.additionalSignatures];
      }
      additionalSignatures.push(signatureData);

      await ContractRepository.update(contractId, {
        status: 'FIRMADO',
        digitalSignature: signatureResult.signature,
        signedAt: signedAtLocal.toISOString(),
        signedBy: {
          userId,
          email: user.EMAIL,
          document: user.DOCUMENT,
          name: user.NAME,
          ip: ipAddress,
          type: 'CLIENTE',
          digitalSignature: signatureResult.signature
        },
        additionalSignatures
      });

      metricsService.recordDocumentSigned();

      const jobId = await queueService.addPDFGenerationJob({
        contractId,
        contract: {
          ...contract,
          signedBy: signatureData,
          signedAt: signedAtLocal.toISOString(),
          additionalSignatures
        }
      });

      await auditService.logDocumentSigned(
        userId,
        contractId,
        ipAddress,
        {
          keyId: contract.KEY_ID,
          algorithm: signatureResult.algorithm,
          timestamp: signatureResult.timestamp
        }
      );

      await cacheService.invalidate('contracts', contractId);
      await cacheService.invalidate('contracts', `user:${userId}`);

      const duration = Date.now() - startTime;
      metricsService.recordRequest('/contracts/sign', 'POST', duration, true);

      logger.info(`Contrato firmado: ${contractId} por usuario ${userId}, Job ID: ${jobId}`);

      return {
        success: true,
        contractId,
        status: 'FIRMADO',
        jobId
      };
    } catch (error) {
      metricsService.recordError(error, 'contract_sign');
      logger.error('Error firmando contrato:', error);

      if (userId) {
        await auditService.logAuditEvent({
          action: 'DOCUMENT_SIGN_FAILED',
          userId,
          contractId,
          ipAddress,
          details: { error: error.message },
          severity: 'ERROR',
          success: false
        });
      }

      throw error;
    }
  }

  async addSignatureToContract(contractId, signerData) {
    const startTime = Date.now();

    try {
      const contract = await this.getContractById(contractId, false);

      if (!contract) {
        throw new Error('Contrato no encontrado');
      }

      if (contract.STATUS !== 'FIRMADO') {
        throw new Error('El contrato debe estar firmado por el cliente primero');
      }

      if (signerData.type?.toUpperCase() === 'CLIENTE') {
        throw new Error('No se puede añadir una firma de tipo CLIENTE');
      }

      if (signerData.userId === contract.USER_ID) {
        throw new Error('El cliente no puede añadir firmas adicionales');
      }

      const user = await UserRepository.findUserById(signerData.userId);
      if (!user) {
        throw new Error('Usuario firmante no encontrado');
      }

      const userClient = await UserRepository.findUserById(contract.USER_ID);
      if (!userClient) {
        throw new Error('Usuario cliente no encontrado');
      }

      const signedAtParaguay = dateUtils.getCurrentDateInTimezone();

      const dataToSign = {
        contractId: contract.ID,
        userId: user.ID,
        email: user.EMAIL,
        document: user.DOCUMENT,
        name: user.NAME,
        type: signerData.type,
        date: signedAtParaguay.toISOString(),
        ip: signerData.userIp
      };

      const signatureStart = Date.now();
      const signatureResult = await cryptographicService.signData(
        Buffer.from(JSON.stringify(dataToSign)),
        contract.KEY_ID,
        { id: userClient.ID, email: userClient.EMAIL, document: userClient.DOCUMENT },
        signerData.userId
      );
      metricsService.recordSignatureGenerated(Date.now() - signatureStart);

      const additionalSignature = {
        userId: user.ID,
        name: user.NAME,
        email: user.EMAIL,
        document: user.DOCUMENT,
        type: signerData.type,
        ip: signerData.userIp,
        signedAt: signedAtParaguay.toISOString(),
        keyId: contract.KEY_ID,
        signatureImage: signerData.signature,
        digitalSignature: signatureResult.signature
      };

      let additionalSignatures = [];
      if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
        additionalSignatures = contract.additionalSignatures.filter(
          sig => sig.userId !== contract.USER_ID && sig.type?.toUpperCase() !== 'CLIENTE'
        );

        const sameTypeIndex = additionalSignatures.findIndex(
          sig => sig.type && sig.type.toUpperCase() === signerData.type.toUpperCase()
        );

        if (sameTypeIndex !== -1) {
          additionalSignatures[sameTypeIndex] = additionalSignature;
        } else {
          additionalSignatures.push(additionalSignature);
        }
      } else {
        additionalSignatures.push(additionalSignature);
      }

      await ContractRepository.updateSignatures(contractId, { additionalSignatures });

      const jobId = await queueService.addPDFGenerationJob({
        contractId,
        contract: {
          ...contract,
          additionalSignatures
        },
        onlyAdditionalSignatures: true,
        newSignatureType: signerData.type
      });

      await auditService.logSignatureAdded(
        signerData.userId,
        contractId,
        signerData.userIp,
        signerData.type
      );

      await cacheService.invalidate('contracts', contractId);

      const duration = Date.now() - startTime;
      metricsService.recordRequest('/contracts/add-signature', 'POST', duration, true);

      logger.info(
        `Firma adicional añadida al contrato ${contractId} por ${user.NAME} (${signerData.type})`
      );

      return {
        success: true,
        contractId,
        signerType: signerData.type,
        jobId
      };
    } catch (error) {
      metricsService.recordError(error, 'add_signature');
      logger.error('Error añadiendo firma:', error);
      throw error;
    }
  }

  async generateSignedPDFWorker(jobData) {
    try {
      const { contractId, contract, onlyAdditionalSignatures = false } = jobData;

      logger.info(`Generando PDF firmado para contrato ${contractId}`);

      const documentBuffer = await this.getDocumentContent(contract.FILE_PATH || contract.file_path);

      if (!documentBuffer) {
        throw new Error('No se pudo obtener el contenido del documento');
      }

      const pdfDoc = await PDFLibDocument.load(documentBuffer);
      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const { width } = lastPage.getSize();

      const styleConfig = {
        font: await pdfDoc.embedFont('Helvetica-Bold'),
        size: 8,
        color: rgb(0, 0, 0),
        margin: 10
      };

      const FIRMA_POSITIONS = {
        CLIENTE: 0,
        JURIDICO: 1,
        LEGAL: 2
      };

      const signatureWidth = width / 3;
      const firmasParaAñadir = [];

      if (!onlyAdditionalSignatures && contract.signedBy) {
        firmasParaAñadir.push({
          ...contract.signedBy,
          position: FIRMA_POSITIONS.CLIENTE
        });
      }

      if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
        for (const firma of contract.additionalSignatures) {
          const tipoFirma = (firma.type || '').toUpperCase();

          if (tipoFirma === 'JURIDICO') {
            firmasParaAñadir.push({ ...firma, position: FIRMA_POSITIONS.JURIDICO });
          } else if (tipoFirma === 'LEGAL') {
            firmasParaAñadir.push({ ...firma, position: FIRMA_POSITIONS.LEGAL });
          }
        }
      }

      for (const signature of firmasParaAñadir) {
        const xPosition = 10 + (signature.position * signatureWidth);
        const yPosition = 180;

        this.addSignatureToPage(lastPage, signature, xPosition, yPosition, styleConfig);
      }

      const signedPdfBytes = await pdfDoc.save();
      const contentBuffer = Buffer.from(signedPdfBytes);

      const hashData = documentIntegrityService.generateDocumentHash(contentBuffer);

      const uploadResult = await documentStorageService.storeDocument({
        fileName: contract.FILE_NAME || contract.file_name,
        directory: process.env.DOCUMENT_DIRECTORY || 'GESTION_ONLINE',
        content: contentBuffer,
        fileMimeType: contract.FILE_MIMETYPE || contract.file_mimetype,
        contractId,
        compress: true
      });

      await ContractRepository.updatePath(contractId, {
        file_path: uploadResult.fullPath,
        file_name: uploadResult.fileName,
        file_mimetype: uploadResult.mimeType
      });

      await cacheService.invalidate('contracts', contractId);

      logger.info(`PDF firmado generado y almacenado: ${uploadResult.fullPath}`);

      return {
        success: true,
        path: uploadResult.fullPath,
        compressionInfo: uploadResult.compressionInfo,
        hashData
      };
    } catch (error) {
      logger.error('Error generando PDF firmado:', error);
      throw error;
    }
  }

  addSignatureToPage(page, signature, xPosition, yPosition, styleConfig) {
    const addText = (text, offset = 0) => {
      page.drawText(text, {
        x: xPosition,
        y: yPosition - offset,
        ...styleConfig
      });
    };

    const truncatedSignature =
      signature.digitalSignature && signature.digitalSignature.length > 20
        ? signature.digitalSignature.substring(0, 20)
        : signature.digitalSignature || '';

    const dateFormatted = dateUtils.formatDateForDisplay(
      signature.signedAt,
      'dd/MM/yyyy HH:mm:ss'
    );

    addText('Firma en conformidad');
    addText(`(${signature.document}) ${signature.name}`, styleConfig.margin);
    addText(dateFormatted, styleConfig.margin * 2);
    addText(signature.ip, styleConfig.margin * 3);
    addText('Certificado número de serie:', styleConfig.margin * 4);
    addText(truncatedSignature, styleConfig.margin * 5);
  }

  async getDocumentContent(filePath) {
    const DBService = require('./dbService');
    return await DBService.getDocumentContent(filePath, false);
  }

  async verifyContractIntegrity(contractId, userId = null) {
    try {
      const result = await documentIntegrityService.verifyDocumentChain(contractId);

      if (userId) {
        await auditService.logIntegrityCheck(userId, contractId, result);
      }

      metricsService.recordDocumentVerified();

      return result;
    } catch (error) {
      logger.error('Error verificando integridad:', error);
      throw error;
    }
  }
}

module.exports = new ContractService();
