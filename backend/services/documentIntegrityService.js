const crypto = require('crypto');
const DBService = require('./dbService');

class DocumentIntegrityService {
  generateDocumentHash(documentBuffer) {
    if (!Buffer.isBuffer(documentBuffer)) {
      throw new Error('El documento debe ser un Buffer');
    }

    const sha512Hash = crypto.createHash('sha512').update(documentBuffer).digest('hex');
    const sha256Hash = crypto.createHash('sha256').update(documentBuffer).digest('hex');

    return {
      sha512: sha512Hash,
      sha256: sha256Hash,
      size: documentBuffer.length,
      timestamp: new Date().toISOString()
    };
  }

  verifyDocumentIntegrity(documentBuffer, storedHashData) {
    try {
      const currentHash = this.generateDocumentHash(documentBuffer);

      const sha512Match = currentHash.sha512 === storedHashData.sha512;
      const sha256Match = currentHash.sha256 === storedHashData.sha256;
      const sizeMatch = currentHash.size === storedHashData.size;

      const isValid = sha512Match && sha256Match && sizeMatch;

      return {
        isValid,
        details: {
          sha512Match,
          sha256Match,
          sizeMatch,
          currentSize: currentHash.size,
          expectedSize: storedHashData.size,
          verifiedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error verificando integridad:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  async storeDocumentHash(contractId, hashData) {
    try {
      const query = `
        UPDATE FDC_CONTRATOS
        SET
          DOCUMENT_HASH_SHA512 = :sha512,
          DOCUMENT_HASH_SHA256 = :sha256,
          DOCUMENT_SIZE = :size,
          HASH_TIMESTAMP = :timestamp
        WHERE ID = :contractId
      `;

      await DBService.executeQuery(query, {
        sha512: hashData.sha512,
        sha256: hashData.sha256,
        size: hashData.size,
        timestamp: hashData.timestamp,
        contractId
      });

      console.log(`Hash de documento almacenado para contrato ${contractId}`);

      return { success: true, contractId };
    } catch (error) {
      console.error('Error almacenando hash:', error);
      throw new Error(`Error al almacenar hash: ${error.message}`);
    }
  }

  async retrieveDocumentHash(contractId) {
    try {
      const query = `
        SELECT
          DOCUMENT_HASH_SHA512 as sha512,
          DOCUMENT_HASH_SHA256 as sha256,
          DOCUMENT_SIZE as size,
          HASH_TIMESTAMP as timestamp
        FROM FDC_CONTRATOS
        WHERE ID = :contractId
      `;

      const result = await DBService.executeQuery(query, { contractId });

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error recuperando hash:', error);
      throw new Error(`Error al recuperar hash: ${error.message}`);
    }
  }

  generateChecksumManifest(documentData) {
    const manifest = {
      contractId: documentData.contractId,
      fileName: documentData.fileName,
      fileSize: documentData.fileSize,
      mimeType: documentData.mimeType,
      hashes: documentData.hashes,
      createdAt: new Date().toISOString(),
      version: '1.0'
    };

    const manifestString = JSON.stringify(manifest, null, 2);
    const manifestHash = crypto
      .createHash('sha256')
      .update(manifestString)
      .digest('hex');

    return {
      manifest,
      manifestHash
    };
  }

  async verifyDocumentChain(contractId) {
    try {
      const documentBuffer = await DBService.getDocumentContent(contractId);
      const storedHash = await this.retrieveDocumentHash(contractId);

      if (!storedHash) {
        return {
          isValid: false,
          reason: 'No existe hash almacenado para este documento'
        };
      }

      return this.verifyDocumentIntegrity(documentBuffer, storedHash);
    } catch (error) {
      console.error('Error verificando cadena de documento:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = new DocumentIntegrityService();
