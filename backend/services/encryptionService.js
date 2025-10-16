const crypto = require('crypto');

const ENCRYPTION_CONFIG = {
  ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,
  IV_LENGTH: 16,
  AUTH_TAG_LENGTH: 16,
  SALT_LENGTH: 32,
  ITERATIONS: 310000,
  DIGEST: 'sha512',
  KEY_ROTATION_DAYS: 90
};

class EncryptionService {
  deriveKey(passphrase, salt) {
    if (!passphrase || typeof passphrase !== 'string') {
      throw new Error('Passphrase inválida para derivación de clave');
    }

    if (!Buffer.isBuffer(salt) || salt.length !== ENCRYPTION_CONFIG.SALT_LENGTH) {
      throw new Error('Salt inválido para derivación de clave');
    }

    return crypto.pbkdf2Sync(
      passphrase,
      salt,
      ENCRYPTION_CONFIG.ITERATIONS,
      ENCRYPTION_CONFIG.KEY_LENGTH,
      ENCRYPTION_CONFIG.DIGEST
    );
  }

  encrypt(data, passphrase) {
    try {
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

      const salt = crypto.randomBytes(ENCRYPTION_CONFIG.SALT_LENGTH);
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);

      const key = this.deriveKey(passphrase, salt);

      const cipher = crypto.createCipheriv(
        ENCRYPTION_CONFIG.ALGORITHM,
        key,
        iv,
        { authTagLength: ENCRYPTION_CONFIG.AUTH_TAG_LENGTH }
      );

      const encrypted = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      const result = {
        encrypted: encrypted.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: ENCRYPTION_CONFIG.ALGORITHM
      };

      return result;
    } catch (error) {
      throw new Error(`Error en cifrado: ${error.message}`);
    }
  }

  decrypt(encryptedData, passphrase) {
    try {
      const { encrypted, salt, iv, authTag, algorithm } = encryptedData;

      if (algorithm !== ENCRYPTION_CONFIG.ALGORITHM) {
        throw new Error(`Algoritmo no soportado: ${algorithm}`);
      }

      const encryptedBuffer = Buffer.from(encrypted, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');
      const ivBuffer = Buffer.from(iv, 'base64');
      const authTagBuffer = Buffer.from(authTag, 'base64');

      const key = this.deriveKey(passphrase, saltBuffer);

      const decipher = crypto.createDecipheriv(
        algorithm,
        key,
        ivBuffer,
        { authTagLength: ENCRYPTION_CONFIG.AUTH_TAG_LENGTH }
      );

      decipher.setAuthTag(authTagBuffer);

      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);

      return decrypted;
    } catch (error) {
      if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
        throw new Error('Fallo en autenticación: datos corruptos o passphrase incorrecta');
      }
      throw new Error(`Error en descifrado: ${error.message}`);
    }
  }

  generateSecurePassphrase(userData) {
    if (!userData || typeof userData !== 'object') {
      throw new Error('Datos de usuario inválidos para generar passphrase');
    }

    const orderedData = {};
    Object.keys(userData)
      .sort()
      .forEach(key => {
        orderedData[key] = userData[key];
      });

    return JSON.stringify(orderedData);
  }

  validateEncryptedData(encryptedData) {
    const requiredFields = ['encrypted', 'salt', 'iv', 'authTag', 'algorithm'];

    for (const field of requiredFields) {
      if (!encryptedData[field]) {
        throw new Error(`Campo requerido faltante: ${field}`);
      }
    }

    try {
      Buffer.from(encryptedData.encrypted, 'base64');
      Buffer.from(encryptedData.salt, 'base64');
      Buffer.from(encryptedData.iv, 'base64');
      Buffer.from(encryptedData.authTag, 'base64');
    } catch (error) {
      throw new Error('Formato base64 inválido en datos cifrados');
    }

    return true;
  }
}

module.exports = new EncryptionService();
