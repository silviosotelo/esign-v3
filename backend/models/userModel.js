// models/userModel.js
class User {
  constructor({ email, name, document, password, role = 'user', googleId = null }) {
    this.email = email;
    this.name = name;
    this.document = document;
    this.password = password;
    this.role = role;
    this.googleId = googleId;
    this.createdAt = new Date();
  }

  toOracleObject() {
    return {
      EMAIL: this.email,
      NAME: this.name,
      DOCUMENT: this.document,
      PASSWORD: this.password,
      ROLE: this.role,
      GOOGLE_ID: this.googleId,
      CREATED_AT: this.createdAt
    };
  }

  static fromOracle(row) {
    return new User({
      id: row.ID,
      email: row.EMAIL,
      name: row.NAME,
      document: row.DOCUMENT,
      password: row.PASSWORD,
      role: row.ROLE,
      is2FAEnabled: row.IS_2FA_ENABLED === 1,
      twoFASecret: row.TWO_FA_SECRET
    });
  }
}

module.exports = User;