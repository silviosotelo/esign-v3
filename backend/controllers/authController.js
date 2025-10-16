const { generateToken, verify2FAToken, generate2FASecret } = require('../utils/authUtils');
const { findUserByEmail, findUserByCi, findUserById, registerUser, updateUser } = require('../services/userService');
const { check, validationResult } = require('express-validator');
const qrcode = require('qrcode');
const argon2 = require('argon2');
const { googleClient } = require('../config/googleOAuth');
const jwt = require('jsonwebtoken');

// Registrar nuevo usuario (OracleDB)
exports.registerUser = [
  check('email', 'Invalid email').isEmail().normalizeEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }).trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, document, email, password, role = 'user' } = req.body;

    try {
      // Verificar existencia de usuario
      const existingUser = await findUserByCi(document);
      if (existingUser) return res.status(400).json({ error: 'User already exists' });  

      // Hash de contraseña y registro
      const hashedPassword = await argon2.hash(password);
      await registerUser({
        name,
        document,
        email,
        password: hashedPassword,
        role: role//.toUpperCase()
      });

      res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Server error during registration' });
    }
  }
];

// Login de usuario (OracleDB)
exports.loginUser = async (req, res) => {
  const { ci, email, password, twoFAToken } = req.body;

  try {
    //const user = await findUserByEmail(email);
    const user = await findUserByCi(ci);
    if (!user) return res.status(400).json({ error: 'Invalid credentials or User not found' });
    // Verificar contraseña
    const isMatch = await argon2.verify(user.PASSWORD, password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials or Incorrect password' });

    // Verificar 2FA
    if (user.IS_2FA_ENABLED === 1) {
      if (!twoFAToken) return res.status(400).json({ error: '2FA token required' });
      if (!verify2FAToken(user.TWO_FA_SECRET, twoFAToken)) {
        return res.status(400).json({ error: 'Invalid 2FA token' });
      }
    }

    // Generar token JWT
    const tokenPayload = {
      userId: user.ID,
      email: user.EMAIL,
      role: user.ROLE
    };
    const token = generateToken(tokenPayload);

    res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};


// Autenticación con Google (OracleDB)
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
      const hashedPassword = await argon2.hash(googleId);
      user = await registerUser({
        email,
        password: hashedPassword,
        google_id: googleId
      });
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
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Error during Google authentication' });
  }
};

// Generar QR 2FA (OracleDB)
exports.generate2FA = async (req, res) => {
  try {
    const user = await findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secret = generate2FASecret();
    await updateUser(user.ID, {
      TWO_FA_SECRET: secret.base32,
      IS_2FA_ENABLED: 1
    });

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) return res.status(500).json({ error: 'Error generating QR code' });
      res.json({
        qrcode: data_url,
        secret: secret.base32,
        manualEntryCode: `otpauth://totp/${encodeURIComponent(user.EMAIL)}?secret=${secret.base32}&issuer=DocSigner`
      });
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Error configuring 2FA' });
  }
};

// authController.js

exports.refreshTokens = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Lógica para generar nuevos tokens
    const newTokens = await authService.refreshTokens(refreshToken);

    res.status(200).json(newTokens);
  } catch (error) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
};