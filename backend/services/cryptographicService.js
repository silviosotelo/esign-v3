const crypto = require('crypto');
const KeyRepository = require('../repositories/keyRepository');
const DocumentKey = require('../models/keyModel');
const encryptionService = require('./encryptionService');

const SIGNATURE_CONFIG = {
  ALGORITHM: 'RSA-SHA512',
  KEY_TYPE: 'rsa',
  MODULUS_LENGTH: 4096,
  PUBLIC_KEY_FORMAT: {
    type: 'spki',
    format: 'pem'
  },
  PRIVATE_KEY_FORMAT: {
    type: 'pkcs8',
    format: 'pem'
  }
};

class CryptographicService {
  async generateKeyPair(userPassphrase) {
    try {
      const normalizedPassphrase = encryptionService.generateSecurePassphrase(userPassphrase);

      if (!normalizedPassphrase) {
        throw new Error('Passphrase normalizada es inválida');
      }

      const { publicKey, privateKey } = crypto.generateKeyPairSync(
        SIGNATURE_CONFIG.KEY_TYPE,
        {
          modulusLength: SIGNATURE_CONFIG.MODULUS_LENGTH,
          publicKeyEncoding: SIGNATURE_CONFIG.PUBLIC_KEY_FORMAT,
          privateKeyEncoding: SIGNATURE_CONFIG.PRIVATE_KEY_FORMAT
        }
      );

      const encryptedPrivateKey = encryptionService.encrypt(
        privateKey,
        normalizedPassphrase
      );

      const keyId = crypto
        .createHash('sha256')
        .update(publicKey)
        .digest('hex');

      const keyData = new DocumentKey({
        keyId,
        publicKey,
        encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
        iv: encryptedPrivateKey.iv,
        salt: encryptedPrivateKey.salt,
        algorithm: encryptedPrivateKey.algorithm,
        usedPassphrase: normalizedPassphrase
      });

      await KeyRepository.create(keyData);

      console.log(`Par de claves generado y almacenado: ${keyId}`);

      return { publicKey, keyId };
    } catch (error) {
      console.error('Error generando par de claves:', error);
      throw new Error(`Error en generación de claves: ${error.message}`);
    }
  }

  async signData(data, keyId, userPassphrase) {
    try {
      const keyRecord = await KeyRepository.findByKeyId(keyId);
      if (!keyRecord) {
        throw new Error('Clave no encontrada');
      }

      const key = DocumentKey.fromOracle(keyRecord);
      const normalizedPassphrase = encryptionService.generateSecurePassphrase(userPassphrase);

      if (key.usedPassphrase && key.usedPassphrase !== normalizedPassphrase) {
        console.warn('Advertencia: passphrase no coincide con la original');
      }

      let encryptedPrivateKeyData;
      if (typeof key.encryptedPrivateKey === 'string') {
        try {
          encryptedPrivateKeyData = JSON.parse(key.encryptedPrivateKey);
        } catch (parseError) {
          throw new Error('Formato de clave privada cifrada inválido');
        }
      } else {
        encryptedPrivateKeyData = key.encryptedPrivateKey;
      }

      encryptionService.validateEncryptedData(encryptedPrivateKeyData);

      const decryptedPrivateKey = encryptionService.decrypt(
        encryptedPrivateKeyData,
        normalizedPassphrase
      );

      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));

      const signer = crypto.createSign(SIGNATURE_CONFIG.ALGORITHM);
      signer.update(dataBuffer);
      const signature = signer.sign(decryptedPrivateKey.toString('utf8'), 'base64');

      return {
        signature,
        keyId,
        timestamp: new Date().toISOString(),
        algorithm: SIGNATURE_CONFIG.ALGORITHM
      };
    } catch (error) {
      console.error('Error en firma digital:', error);
      throw new Error(`Error en proceso de firma: ${error.message}`);
    }
  }

  async verifySignature(data, signature, keyId) {
    try {
      const publicKey = await KeyRepository.getPublicKey(keyId);
      if (!publicKey) {
        return { isValid: false, reason: 'Clave pública no encontrada' };
      }

      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));

      const verifier = crypto.createVerify(SIGNATURE_CONFIG.ALGORITHM);
      verifier.update(dataBuffer);

      const isValid = verifier.verify(publicKey, signature, 'base64');

      return {
        isValid,
        verifiedAt: new Date().toISOString(),
        keyId
      };
    } catch (error) {
      console.error('Error verificando firma:', error);
      return {
        isValid: false,
        reason: error.message
      };
    }
  }

  generateDocumentHash(documentBuffer) {
    if (!Buffer.isBuffer(documentBuffer)) {
      throw new Error('El documento debe ser un Buffer');
    }

    const hash = crypto.createHash('sha512').update(documentBuffer).digest('hex');

    return hash;
  }

  verifyDocumentHash(documentBuffer, expectedHash) {
    const actualHash = this.generateDocumentHash(documentBuffer);
    return actualHash === expectedHash;
  }

  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

module.exports = new CryptographicService();
