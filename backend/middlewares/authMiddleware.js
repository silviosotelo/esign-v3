// authMiddleware.js
const jwt = require('jsonwebtoken');
const { generateToken, verifyToken } = require('../utils/authUtils');
const UserRepository = require('../repositories/userRepository');
require('dotenv').config();

// Configuración JWT
const JWT_CONFIG = {
  algorithm: 'HS256',
  audience: 'e-sign-api',
  issuer: 'DocSigner-API',
  expiresIn: '15m'
};

const handleAuthError = (res, code, message) => {
  console.warn(`Auth Error ${code}: ${message}`);
  return res.status(code).json({ success: false, code: `AUTH_${code}`, message });
};

const authenticate = (options = {}) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    // Validar formato del token
    if (!authHeader?.startsWith('Bearer ')) {
      return handleAuthError(res, 401, 'Formato de token inválido');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    
    // Verificación JWT
    try {
      decoded = verifyToken(token, process.env.JWT_SECRET, JWT_CONFIG);
    } catch (error) {
      return handleAuthError(res, 401, 'Token inválido o expirado');
    }

    // Verificación en base de datos mediante repositorio
    try {
      const user = await UserRepository.findUserById(decoded.userId);
      
      if (!user) return handleAuthError(res, 401, 'Usuario no existe');
      if (user.tokenVersion !== decoded.tokenVersion) {
        return handleAuthError(res, 401, 'Sesión inválida');
      }
      if (options.role && user.role !== options.role) {
        return handleAuthError(res, 403, 'Acceso no autorizado');
      }
      req.user = {
        id: user.ID,
        email: user.EMAIL,
        role: user.ROLE,
        tokenVersion: user.TOKEN_VERSION
      };

      next();
    } catch (error) {
      return handleAuthError(res, 500, 'Error de verificación');
    }
  };
};




// Métodos auxiliares
authenticate.parseJWTError = (error) => {
  const errors = {
    JsonWebTokenError: 'Token inválido',
    TokenExpiredError: 'Token expirado',
    NotBeforeError: 'Token no activo'
  };
  return errors[error.name] || 'Error de autenticación';
};

// Middleware de refresh token usando repositorio
authenticate.refresh = async (req, res, next) => {
  const refreshToken = req.headers['x-refresh-token'];
  
  if (!refreshToken) {
    return handleAuthError(res, 401, 'Refresh token requerido');
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET, JWT_CONFIG);
    await UserRepository.incrementTokenVersion(decoded.userId);
    
    const user = await UserRepository.findById(decoded.userId);
    req.newTokens = this.generateTokens(user);
    
    next();
  } catch (error) {
    return handleAuthError(res, 401, 'Refresh token inválido');
  }
};

authenticate.generateTokens = (user) => ({
  accessToken: jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { ...JWT_CONFIG, expiresIn: '15m' }
  ),
  refreshToken: jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion },
    process.env.REFRESH_SECRET,
    { ...JWT_CONFIG, expiresIn: '7d' }
  )
});

// Middleware de roles
authenticate.role = (...roles) => authenticate({ role: roles });

module.exports = authenticate;