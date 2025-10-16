const crypto = require('crypto');
const KeyRepository = require('../repositories/keyRepository');
const DocumentKey = require('../models/keyModel');
const cryptographicService = require('../services/cryptographicService');
const auditService = require('../services/auditService');

const ALGORITHM = {
  SIGN: 'RSA-SHA512',
  KEY_TYPE: 'rsa',
  KEY_FORMAT: {
    public: 'spki',
    private: 'pkcs8',
    cipher: 'aes-256-cbc'
  },
  MODULUS_LENGTH: 4096,
  IV_LENGTH: 16
};

/**
 * Normaliza un passphrase para asegurar consistencia entre cifrado y descifrado
 * @param {string|object} passphrase - Passphrase a normalizar
 * @returns {string} Passphrase normalizado
 */
function normalizePassphrase(passphrase) {
  // Caso 1: Ya es un string
  if (typeof passphrase === 'string') {
    return passphrase;
  }
  
  // Caso 2: Es un objeto
  if (typeof passphrase === 'object' && passphrase !== null) {
    try {
      // Crear una representación canónica ordenando las propiedades
      const orderedObj = {};
      Object.keys(passphrase)
        .sort()
        .forEach(key => {
          orderedObj[key] = passphrase[key];
        });
      
      // Convertir a JSON sin espacios en blanco
      return JSON.stringify(orderedObj);
    } catch (error) {
      console.error('Error normalizando objeto passphrase:', error);
      // Si hay error, intentar convertir directamente
      return JSON.stringify(passphrase);
    }
  }
  
  // Caso 3: Otros tipos (number, boolean, etc.)
  return String(passphrase);
}

/**
 * Función de diagnóstico para examinar objetos binarios
 * @param {string} label - Etiqueta descriptiva
 * @param {*} buffer - Buffer o datos a analizar
 */
function diagnoseBuffer(label, buffer) {
  console.log('--------------------------------------------');
  console.log(`DIAGNÓSTICO: ${label}`);
  console.log(`Tipo: ${typeof buffer}`);
  console.log(`Es Buffer: ${Buffer.isBuffer(buffer)}`);
  
  if (Buffer.isBuffer(buffer)) {
    console.log(`Longitud: ${buffer.length}`);
    console.log(`Primeros 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
    console.log(`Últimos 20 bytes: ${buffer.slice(-20).toString('hex')}`);
    console.log(`Longitud divisible por 16: ${buffer.length % 16 === 0 ? 'SÍ' : 'NO'}`);
  } else if (buffer && typeof buffer === 'object') {
    console.log(`Propiedades: ${Object.keys(buffer).join(', ')}`);
    console.log(`toString disponible: ${'toString' in buffer}`);
    if ('toString' in buffer) {
      try {
        const strVersion = buffer.toString();
        console.log(`Primera parte como string: ${strVersion.substring(0, 50)}`);
      } catch (e) {
        console.log(`Error al convertir a string: ${e.message}`);
      }
    }
  } else if (typeof buffer === 'string') {
    console.log(`Longitud de string: ${buffer.length}`);
    console.log(`Primeros 50 caracteres: ${buffer.substring(0, 50)}`);
  }
  console.log('--------------------------------------------');
}

exports.generateKeyPair = async (passphrase, userId = null) => {
  try {
    // Normalizar el passphrase para consistencia
    const normalizedPass = normalizePassphrase(passphrase);
    
    console.log('generateKeyPair.passphrase (normalizado): ', normalizedPass);

    // Validar la passphrase antes de continuar
    if (!normalizedPass || typeof normalizedPass !== 'string') {
      console.error('Error: `passphrase` normalizado es inválido o undefined.');
      throw new Error('La frase de contraseña no es válida');
    }

    const iv = crypto.randomBytes(ALGORITHM.IV_LENGTH);
    const salt = crypto.randomBytes(16);

    // Para depuración
    console.log('Passphrase usado para cifrado:', normalizedPass);
    console.log('Primeros bytes del salt:', salt.slice(0, 4).toString('hex'));

    // Derivar la clave de cifrado a partir del passphrase normalizado
    const derivedKey = crypto.pbkdf2Sync(
      normalizedPass,
      salt,
      100_000,
      32,
      'sha512'
    );

    // Generar las claves RSA
    const { publicKey, privateKey } = crypto.generateKeyPairSync(ALGORITHM.KEY_TYPE, {
      modulusLength: ALGORITHM.MODULUS_LENGTH,
      publicKeyEncoding: {
        type: ALGORITHM.KEY_FORMAT.public,
        format: 'pem'
      },
      privateKeyEncoding: {
        type: ALGORITHM.KEY_FORMAT.private,
        format: 'pem'
      }
    });

    // Cifrar clave privada
    const cipher = crypto.createCipheriv(
      ALGORITHM.KEY_FORMAT.cipher,
      derivedKey,
      iv
    );

    const encryptedPrivateKey = Buffer.concat([
      cipher.update(privateKey, 'utf8'),
      cipher.final()
    ]);

    // Diagnóstico del buffer encriptado
    diagnoseBuffer('encryptedPrivateKey antes de almacenar', encryptedPrivateKey);

    // Validar el tamaño del buffer
    if (encryptedPrivateKey.length % 16 !== 0) {
      console.error('Error: El tamaño del encryptedPrivateKey no es múltiplo de 16 durante el cifrado.');
      throw new Error('Invalid encrypted data length on encryption');
    }

    // Generar un ID único para las claves
    const keyId = crypto.createHash('sha256').update(publicKey).digest('hex');

    // Preparar los datos para almacenar en la base de datos
    // Convertir a base64 para almacenamiento
    const keyData = new DocumentKey({
      keyId,
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
      iv: iv.toString('base64'),
      salt: salt.toString('base64'),
      algorithm: ALGORITHM.KEY_FORMAT.cipher,
      usedPassphrase: normalizedPass // Solo para depuración
    });

    // Almacenar las claves
    const result = await KeyRepository.create(keyData);

    console.log('Generate key pair and store in database:', result);

    console.log(`Claves generadas y almacenadas con keyId: ${keyId}`);

    if (userId) {
      try {
        await auditService.logKeyGenerated(userId, keyId, null);
      } catch (auditError) {
        console.warn('Error registrando auditoría de generación de claves:', auditError);
      }
    }

    return { publicKey, keyId };
  } catch (error) {
    console.error('Error generando el par de claves:', error);
    throw new Error(`Failed to generate key pair: ${error.message}`);
  }
};

exports.generateSignature = async (data, keyId, passphrase, userId = null) => {
  try {
    console.log('Contract KeyId: ', keyId);
    const keyRecord = await KeyRepository.findByKeyId(keyId);
    if (!keyRecord) throw new Error('Contract Key not found');

    const key = DocumentKey.fromOracle(keyRecord);

    // Normalizar el passphrase de la misma manera que en generateKeyPair
    const normalizedPass = normalizePassphrase(passphrase);
    
    console.log('generateSignature.passphrase (normalizado): ', normalizedPass);

    // Para depuración, verificar si coincide con el almacenado
    if (key.usedPassphrase && key.usedPassphrase !== normalizedPass) {
      console.warn('ADVERTENCIA: El passphrase actual no coincide con el original usado para cifrar');
      console.log('Original:', key.usedPassphrase);
      console.log('Actual:', normalizedPass);
    }

    // Validar que tenemos una passphrase válida
    if (!normalizedPass || typeof normalizedPass !== 'string') {
      console.error(`Error: passphrase normalizado es inválido o undefined.`);
      throw new Error('La frase de contraseña no es válida');
    }

    // Convertir los datos almacenados de base64 a Buffer si es necesario
    let encryptedPrivateKey;
    if (typeof key.encryptedPrivateKey === 'string') {
      encryptedPrivateKey = Buffer.from(key.encryptedPrivateKey, 'base64');
    } else if (Buffer.isBuffer(key.encryptedPrivateKey)) {
      encryptedPrivateKey = key.encryptedPrivateKey;
    } else {
      console.error('Tipo de dato inesperado para encryptedPrivateKey:', typeof key.encryptedPrivateKey);
      throw new Error('Formato de clave privada no reconocido');
    }
      
    // iv y salt ya son Buffers debido a la conversión en DocumentKey.fromOracle
    const iv = key.iv;
    const salt = key.salt;

    // Diagnóstico de los buffers recuperados
    diagnoseBuffer('encryptedPrivateKey recuperado', encryptedPrivateKey);
    diagnoseBuffer('IV recuperado', iv);
    diagnoseBuffer('Salt recuperado', salt);

    // Validar el tamaño del buffer cifrado
    if (encryptedPrivateKey.length % 16 !== 0) {
      console.error(`Error: El tamaño del encryptedPrivateKey (${encryptedPrivateKey.length}) no es múltiplo de 16.`);
      throw new Error('Invalid encrypted data length');
    }

    // Asegurar que los buffer binarios son correctos
    console.log('Primeros bytes del salt:', salt.slice(0, 4).toString('hex'));
    
    // Derivar clave de cifrado con la passphrase normalizada
    const derivedKey = crypto.pbkdf2Sync(
      normalizedPass,
      salt,
      100_000,
      32,
      'sha512'
    );

    // Validar el IV antes de descifrar
    if (!Buffer.isBuffer(iv) || iv.length !== 16) {
      console.error('Error: IV no válido.');
      throw new Error('Invalid IV length');
    }

    // Descifrar clave privada
    const decipher = crypto.createDecipheriv(
      ALGORITHM.KEY_FORMAT.cipher,
      derivedKey,
      iv
    );

    let decryptedPrivateKey;
    try {
      decryptedPrivateKey = Buffer.concat([
        decipher.update(encryptedPrivateKey),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      console.error('Error al descifrar la clave privada:', error);
      throw new Error(`Decryption failed: ${error.message}`);
    }

    // Crear firma con la clave privada descifrada
    const signer = crypto.createSign(ALGORITHM.SIGN);
    signer.update(data);

    const signature = signer.sign(decryptedPrivateKey, 'base64');

    if (userId) {
      try {
        await auditService.logAuditEvent({
          action: 'KEY_USED',
          userId,
          details: { keyId, algorithm: ALGORITHM.SIGN },
          severity: 'INFO'
        });
      } catch (auditError) {
        console.warn('Error registrando auditoría de uso de clave:', auditError);
      }
    }

    return {
      signature,
      keyId,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('gS.Signing error:', error);
    throw new Error(`Signing process failed: ${error.message}`);
  }
};

// Verificar firma
exports.verifySignature = async (data, signature, keyId) => {
  try {
    const publicKey = await KeyRepository.getPublicKey(keyId);
    if (!publicKey) return { isValid: false };

    const verifier = crypto.createVerify(ALGORITHM.SIGN);
    verifier.update(data);
    
    return {
      isValid: verifier.verify(publicKey, signature, 'base64'),
      verifiedAt: new Date()
    };
  } catch (error) {
    console.error('Verification error:', error);
    return { isValid: false };
  }
};