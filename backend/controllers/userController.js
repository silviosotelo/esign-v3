const { generateToken, verifyToken, verify2FAToken, generate2FASecret } = require('../utils/authUtils');
const { findUserByEmail, findUserById, registerUser, updateUser } = require('../services/userService');
const emailService = require('../services/emailService');
const { validateRecaptcha } = require('../middlewares/recaptchaMiddleware');
const { check, validationResult } = require('express-validator');
const qrcode = require('qrcode');
const argon2 = require('argon2');
const { jwtDecode } = require('jwt-decode');
require('dotenv').config();

// Register a new user (Adaptado para Oracle)
exports.registerUser = [
  check('email', 'Invalid email').isEmail().normalizeEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }).trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role = 'user', recaptchaToken } = req.body;

    try {
      // Verificar existencia de usuario
      const existingUser = await findUserByEmail(email);
      if (existingUser) return res.status(400).json({ error: 'User already exists' });

      // Hash de contraseña y registro
      const hashedPassword = await argon2.hash(password);
      const newUser = await registerUser(email, hashedPassword, role);

      res.status(201).json({
        message: 'User registered successfully',
        userId: newUser.id
      });
    } catch (err) {
      console.error('Registration error:', err.message);
      // En todos los catch blocks
      console.error(`Error en ${req.method} ${req.path}:`, err);
      res.status(500).json({ error: 'Server error during registration' });
    }
  }
];

// Login user (Adaptado para Oracle)
exports.loginUser = async (req, res) => {
  const { email, password, twoFAToken } = req.body;

  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    // Oracle devuelve los campos en MAYÚSCULAS
    const isMatch = await argon2.verify(user.PASSWORD, password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Verificar 2FA (campos adaptados)
    if (user.IS_2FA_ENABLED === 1) {
      if (!twoFAToken) return res.status(400).json({ error: '2FA token required' });
      if (!verify2FAToken(user.TWO_FA_SECRET, twoFAToken)) {
        return res.status(400).json({ error: 'Invalid 2FA token' });
      }
    }

    // Generar token con estructura compatible
    const tokenPayload = {
      userId: user.ID,
      email: user.EMAIL,
      role: user.ROLE
    };
    const token = generateToken(tokenPayload);

    res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    // En todos los catch blocks
    console.error(`Error en ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// Google OAuth2 login (Adaptado para Oracle)
exports.googleLogin = async (req, res) => {
  const { tokenId } = req.body;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const { email, sub: googleId } = ticket.getPayload();
    let user = await findUserByEmail(email);

    // Crear usuario si no existe
    if (!user) {
      const hashedPassword = await argon2.hash(googleId); // Usar Google ID como contraseña temporal
      user = await registerUser(email, hashedPassword, 'user', googleId);
    }

    // Generar token
    const tokenPayload = {
      userId: user.ID,
      email: user.EMAIL,
      role: user.ROLE
    };
    const token = generateToken(tokenPayload);

    res.status(200).json({ token });
  } catch (err) {
    // En todos los catch blocks
    console.error(`Error en ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: err.message });
  }
};

// Generate 2FA QR code (Adaptado)
exports.generate2FA = async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secret = generate2FASecret();
    await updateUser(user.ID, { TWO_FA_SECRET: secret.base32 });

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) return res.status(500).json({ error: 'Error generating QR code' });
      res.json({ qrcode: data_url, secret: secret.base32 });
    });
  } catch (err) {
    // En todos los catch blocks
    console.error(`Error en ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: err.message });
  }
};

// Obtener datos de usuario (Adaptado)
exports.getUserData = async (req, res) => {
  try {
    const userId = req.params.id;
    const userData = await findUserById(userId);

    if (!userData) return res.status(404).json({ error: 'User not found' });

    // Mapear nombres de columnas Oracle
    const response = {
      userId: userData.ID,
      email: userData.EMAIL,
      name: userData.NAME,
      document: userData.DOCUMENT,
      //createdAt: userData.CREATED_AT,
      // En getUserData
      createdAt: new Date(userData.CREATED_AT).toISOString(),
      role: userData.ROLE
    };

    res.status(200).json(response);
  } catch (error) {
    // En todos los catch blocks
    console.error(`Error en ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: error.message });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    // 1. Buscar usuario
    const user = await UserRepository.findByEmail(email);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // 2. Generar token único
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hora

    // 3. Actualizar usuario
    await UserRepository.update(user.id, {
      resetToken,
      resetTokenExpiry
    });

    // 4. Enviar correo
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetLink);

    res.status(200).json({ message: "Correo de restablecimiento enviado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await UserRepository.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Excluir datos sensibles
    const { password, resetToken, ...safeUser } = user;
    res.status(200).json(safeUser);
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'email', 'document', 'password'];
    
    // Filtrar campos permitidos
    Object.keys(req.body).forEach(async key => {
      if (allowedFields.includes(key)) {
        if (key === 'password') {
          // Hashear nueva contraseña
          updates.password = await argon2.hash(req.body.password);
        } else {
          updates[key] = req.body[key];
        }
      }
    });

    const updatedUser = await UserRepository.update(req.user.id, updates);
    res.status(200).json(updatedUser);
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    // Desactivar cuenta en lugar de borrar
    await UserRepository.deactivateUser(req.user.id);
    res.status(204).json({ message: "Cuenta desactivada exitosamente" });
  } catch (error) {
    handleServiceError(error, res);
  }
};

exports.getUserDataByToken = async (req, res) => {

    const authHeader = req.headers.authorization;
    
    // Validar formato del token
    if (!authHeader?.startsWith('Bearer ')) {
      return handleServiceError(res, 401, 'Formato de token inválido');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    
    // Verificación JWT
    try {
      decoded = verifyToken(token, process.env.JWT_SECRET);
      const userData = await findUserById(decoded.userId);

      if (!userData) return res.status(404).json({ error: 'User not found' });
  
      // Mapear nombres de columnas Oracle
      const response = {
        userId: userData.ID,
        email: userData.EMAIL,
        name: userData.NAME,
        document: userData.DOCUMENT,
        //createdAt: userData.CREATED_AT,
        // En getUserData
        createdAt: new Date(userData.CREATED_AT).toISOString(),
        role: userData.ROLE
      };
  
      res.status(200).json(response);
      //res.status(200).json({ userId: decoded.userId});
    } catch (error) {
      // En todos los catch blocks
      console.error(`Error en ${req.method} ${req.path}:`, error);
      res.status(500).json({ error: error.message });
    }

}