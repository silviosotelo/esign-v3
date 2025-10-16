const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
require('dotenv').config();

// Generar token JWT con estructura mejorada
exports.generateToken = (userPayload) => {
  return jwt.sign(
    {
      userId: userPayload.userId,
      email: userPayload.email,
      role: userPayload.role,
      iss: 'DocSigner-API',       // Emisor
      aud: 'e-sign-api'                 // Audiencia
    }, 
    process.env.JWT_SECRET, 
    { 
      algorithm: 'HS256',              // Algoritmo explícito
      expiresIn: '30m'                // Tiempo ajustado
    }
  );
};

// Generar Refresh Token con almacenamiento seguro
exports.generateRefreshToken = (userPayload) => {
  return jwt.sign(
    { 
      userId: userPayload.ID,
      tokenVersion: userPayload.TOKEN_VERSION // Añadir control de versión
    },
    process.env.REFRESH_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '7d'                  // Tiempo más largo
    }
  );
};

// Verificar token con validación completa
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],           // Fuerza algoritmo específico
      issuer: 'DocSigner-API',
      audience: 'e-sign-api'
    });
  } catch (err) {
    throw new Error(`Token verification failed: ${err.message}`);
  }
};

// Verify JWT token
exports.verifyTokens = (token) => {
  try {
      return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
      throw new Error('Invalid or expired token');
  }
};

// Generar secreto 2FA con metadatos
exports.generate2FASecret = () => {
  return speakeasy.generateSecret({
    length: 32,                       // Longitud aumentada
    name: 'DocSigner-API 2FA',      // Nombre de la aplicación
    issuer: process.env.APP_DOMAIN    // Dominio como emisor
  });
};

// Verificar token 2FA con ventana temporal
exports.verify2FAToken = (secret, token) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2,                       // Ventana de 2 intervalos
    step: 30                         // Duración del paso en segundos
  });
};

// Nuevo: Función para decodificar sin verificar
exports.safeDecodeToken = (token) => {
  return jwt.decode(token, { complete: true });
};