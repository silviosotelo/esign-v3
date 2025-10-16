  // models/keyModel.js
class DocumentKey {
  constructor({
    keyId,
    publicKey,
    encryptedPrivateKey,
    iv,
    salt,
    algorithm,
    createdAt,
    usedPassphrase
  }) {
    this.keyId = keyId;
    this.publicKey = publicKey;
    this.encryptedPrivateKey = encryptedPrivateKey;
    this.iv = iv;
    this.salt = salt;
    this.algorithm = algorithm;
    this.createdAt = createdAt || new Date();
    this.usedPassphrase = usedPassphrase; // Para depuración
  }

  toOracleObject() {
    return {
      KEY_ID: this.keyId,
      PUBLIC_KEY: this.publicKey,
      ENCRYPTED_PRIVATE_KEY: this.encryptedPrivateKey, // Se manejará como CLOB en el repositorio
      IV: this.iv,
      SALT: this.salt,
      ALGORITHM: this.algorithm,
      CREATED_AT: this.createdAt,
      USED_PASSPHRASE: this.usedPassphrase
    };
  }

  static fromOracle(row) {
    return {
      keyId: row.KEY_ID,
      publicKey: row.PUBLIC_KEY,
      encryptedPrivateKey: row.ENCRYPTED_PRIVATE_KEY,
      iv: Buffer.from(row.IV, 'base64'),
      salt: Buffer.from(row.SALT, 'base64'),
      algorithm: row.ALGORITHM,
      createdAt: row.CREATED_AT,
      usedPassphrase: row.USED_PASSPHRASE
    };
  }
}

module.exports = DocumentKey;