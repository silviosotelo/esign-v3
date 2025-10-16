const DBService = require('../services/dbService');
const User = require('../models/userModel');

class UserRepository {
  static async findByEmail(email) {
    try {
      const result = await DBService.executeQuery(
        'SELECT * FROM FDC_USUARIOS WHERE EMAIL = :email',
        { email }
      );
      return DBService.mapResult(result, true);
    } catch (error) {
      throw new Error(`Error fetching user by email: ${error.message}`);
    }
  }

  async findUserByEmail(email) {
    try {
      const result = await DBService.executeQuery(
        `SELECT * FROM FDC_USUARIOS WHERE EMAIL = :email`,
        { email }
      );
      return DBService.mapResult(result, true);
    } catch (error) {
      throw new Error(`Error fetching user by email: ${error.message}`);
    }
  }

  async createUser(userData) {
    try {
      const user = new User(userData);
      const result = await DBService.executeQuery(
        `INSERT INTO FDC_USUARIOS (EMAIL, PASSWORD, ROLE) 
         VALUES (:email, :password, :role)
         RETURNING ID INTO :id`,
        {
          email: user.email,
          password: user.password,
          role: user.role,
          id: { type: DBService.oracledb.NUMBER, dir: DBService.oracledb.BIND_OUT }
        }
      );
      return result.outBinds.id[0];
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async findUserById(userId) {
    try {
      const result = await DBService.executeQuery(
        `SELECT * FROM FDC_USUARIOS WHERE ID = :userId`,
        { userId }
      );
      return DBService.mapResult(result, true);
    } catch (error) {
      throw new Error(`Error fetching user by ID: ${error.message}`);
    }
  }

  async findUserByCi(ci) {
    try {
      const result = await DBService.executeQuery(
        `SELECT * FROM FDC_USUARIOS WHERE DOCUMENT = :ci`,
        { ci }
      );
      return DBService.mapResult(result, true);
    } catch (error) {
      throw new Error(`Error fetching user by ID: ${error.message}`);
    }
  }

  async incrementTokenVersion(userId) {
    try {
      await DBService.executeQuery(
        `UPDATE FDC_USUARIOS 
         SET TOKEN_VERSION = TOKEN_VERSION + 1 
         WHERE ID = :userId`,
        { userId }
      );
      return true;
    } catch (error) {
      throw new Error(`Error updating token version: ${error.message}`);
    }
  }


  // userRepository.js
  async update1(userId, updateData) {
    const result = await DBService.executeQuery(
      `UPDATE FDC_USUARIOS SET
      RESET_TOKEN = :resetToken,
      RESET_TOKEN_EXPIRY = :resetTokenExpiry
     WHERE ID = :userId`,
      { ...updateData, userId }
    );
    return result.rowsAffected === 1;
  }

  async deactivateUser(userId) {
    try {
      await DBService.executeQuery(
        `UPDATE FDC_USUARIOS 
         SET IS_ACTIVE = 0 
         WHERE ID = :userId`,
        { userId }
      );
      return true;
    } catch (error) {
      throw new Error(`Error al desactivar usuario: ${error.message}`);
    }
  }

  async create(userData) {
    try {
      const result = await DBService.executeQuery(
        `INSERT INTO FDC_USUARIOS 
        (EMAIL, NAME, DOCUMENT, PASSWORD, ROLE, GOOGLE_ID, CREATED_AT)
        VALUES (:EMAIL, :NAME, :DOCUMENT, :PASSWORD, :ROLE, :GOOGLE_ID, :CREATED_AT)
        RETURNING ID INTO :id`,
        {
          ...userData,
          id: { 
            type: DBService.oracledb.NUMBER,
            dir: DBService.oracledb.BIND_OUT 
          }
        },
        { autoCommit: true } // Añadir esta opción
      );

      return result.outBinds.id[0];
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async update(userId, updateData) {
    try {
      const result = await DBService.executeQuery(
        `UPDATE FDC_USUARIOS SET
          ${Object.keys(updateData).map(k => `${k} = :${k}`).join(', ')}
         WHERE ID = :userId`,
        { ...updateData, userId }
      );
      return DBService.mapResult(result, true);
    } catch (error) {
      throw new Error(`Error actualizando usuario: ${error.message}`);
    }
  }
}

module.exports = new UserRepository();