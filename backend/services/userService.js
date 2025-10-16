// services/userService.js
const User = require('../models/userModel'); // Añadir esta línea
const UserRepository = require('../repositories/userRepository');
const argon2 = require('argon2');

class UserService {
  async registerUser_o(userData) {
    const hashedPassword = await argon2.hash(userData.password);
    const user = new User({ ...userData, password: hashedPassword });
    return UserRepository.createUser(user);
  }

  async registerUser(userData) {
    try {
      //const hashedPassword = await argon2.hash(userData.password);
      
      // Crear instancia del modelo
      const user = new User({
        ...userData,
        //password: hashedPassword,
        role: userData.role || 'user'
      });
      
      // Usar repositorio para guardar
      return UserRepository.create(user.toOracleObject());
    } catch (error) {
      throw new Error(`Error en registro: ${error.message}`);
    }
  }
  
  async findUserByEmail(email) {
    return UserRepository.findUserByEmail(email);
  }

  async findUserById(email) {
    return UserRepository.findUserById(email);
  }

  async findUserByCi(ci) {
    return UserRepository.findUserByCi(ci);
  }
}

module.exports = new UserService();