class Contract {
  constructor({
    id,
    userId,
    title,
    content,
    file_path,
    file_mimetype,
    file_name,
    signature,
    publicKey,
    keyId,
    status = 'PENDIENTE',
    signedAt = null,
    signedBy = {},
    createdAt = new Date(),
    additionalSignatures = {}
  }) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.content = content;
    this.file_path = file_path;
    this.file_mimetype = file_mimetype;
    this.file_name = file_name;
    this.signature = signature;
    this.publicKey = publicKey;
    this.keyId = keyId;
    this.status = status;
    this.signedAt = signedAt;
    this.signedBy = signedBy;
    this.createdAt = createdAt;
    this.additionalSignatures = additionalSignatures;
  }

  toOracleObject() {
    return {
      ID: this.id,
      USER_ID: this.userId,
      TITLE: this.title,
      CONTENT: this.content,
      FILE_PATH: this.file_path,
      FILE_MIMETYPE: this.file_mimetype,
      FILE_NAME: this.file_name,
      SIGNATURE: this.signature,
      PUBLIC_KEY: this.publicKey,
      KEY_ID: this.keyId,
      STATUS: this.status,
      SIGNED_AT: this.signedAt,
      SIGNED_BY: JSON.stringify(this.signedBy),
      CREATED_AT: this.createdAt,
      ADDITIONAL_SIGNATURES: JSON.stringify(this.additionalSignatures)
    };
  }

  static fromOracle(row) {
    if (!row || typeof row !== 'object') {
      console.error('Error: `row` es undefined o no es un objeto válido en fromOracle');
      return null;
    }

    return new Contract({
      id: row.ID || null, //Asegurar que si ID es undefined, se maneje correctamente
      userId: row.USER_ID || null,
      title: row.TITLE || 'Sin título',
      content: row.CONTENT || '',
      file_path: row.FILE_PATH || '',
      file_mimetype: row.FILE_MIMETYPE || '',
      file_name: row.FILE_NAME || '',
      signature: row.SIGNATURE || null,
      publicKey: row.PUBLIC_KEY || null,
      keyId: row.KEY_ID || null,
      status: row.STATUS || 'PENDIENTE',
      signedAt: row.SIGNED_AT || null,
      signedBy: row.SIGNED_BY ? JSON.parse(row.SIGNED_BY) : {},
      createdAt: row.CREATED_AT || new Date(),
      additionalSignatures: row.ADDITIONAL_SIGNATURES ? JSON.parse(row.ADDITIONAL_SIGNATURES) : {}
    });
  }

}

module.exports = Contract;