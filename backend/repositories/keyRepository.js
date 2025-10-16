// repositories/keyRepository.js
const DBService = require('../services/dbService');
const oracledb = DBService.oracledb;

class KeyRepository {
  static async create(keyData) {
    try {
      const oracleObj = keyData.toOracleObject();
      
      // Para manejar correctamente CLOBs en Oracle
      const connection = await oracledb.getConnection();
      
      try {
        // Crear un CLOB temporal para la clave privada encriptada
        const encryptedKeyClob = await connection.createLob(oracledb.CLOB);
        await encryptedKeyClob.write(oracleObj.ENCRYPTED_PRIVATE_KEY);
        
        // Ejecutar la inserción con el CLOB
        const result = await connection.execute(
          `INSERT INTO FDC_DOCUMENT_KEYS (
            KEY_ID, PUBLIC_KEY, ENCRYPTED_PRIVATE_KEY, 
            IV, SALT, ALGORITHM, CREATED_AT, USED_PASSPHRASE
          ) VALUES (
            :keyId, :publicKey, :encryptedPrivateKey,
            :iv, :salt, :algorithm, :createdAt, :usedPassphrase
          )`,
          {
            keyId: oracleObj.KEY_ID,
            publicKey: oracleObj.PUBLIC_KEY,
            encryptedPrivateKey: encryptedKeyClob, // Usar el CLOB en lugar del string
            iv: oracleObj.IV,
            salt: oracleObj.SALT,
            algorithm: oracleObj.ALGORITHM,
            createdAt: oracleObj.CREATED_AT,
            usedPassphrase: oracleObj.USED_PASSPHRASE || null
          },
          { autoCommit: true }
        );
        
        // Cerrar el CLOB
        await encryptedKeyClob.close();
        
        return result;
      } finally {
        await connection.close();
      }
    } catch (error) {
      console.error('Error creating key:', error);
      throw new Error(`Error creating key: ${error.message}`);
    }
  }

  static async findByKeyId(keyId) {
    try {
      const result = await DBService.executeQuery(
        'SELECT * FROM FDC_DOCUMENT_KEYS WHERE KEY_ID = :keyId',
        { keyId },
        { fetchInfo: { ENCRYPTED_PRIVATE_KEY: { type: oracledb.STRING } } }
      );
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error finding key:', error);
      throw error;
    }
  }

  static async getPublicKey(keyId) {
    try {
      const result = await DBService.executeQuery(
        'SELECT PUBLIC_KEY FROM FDC_DOCUMENT_KEYS WHERE KEY_ID = :keyId',
        { keyId }
      );
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0].PUBLIC_KEY;
      }
      return null;
    } catch (error) {
      console.error('Error getting public key:', error);
      throw error;
    }
  }
}

module.exports = KeyRepository;