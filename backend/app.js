const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const { validateEnv } = require('./utils/envValidator');
const { oracledb } = require('./config/db');

// Validar variables de entorno al iniciar
validateEnv();

const app = express();

// ==================== Configuración de Seguridad ====================
/*app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", process.env.FRONTEND_URL],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));*/
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", process.env.FRONTEND_URL || 'http://192.168.41.35:10000/'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://192.168.41.35:10000/']
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));



// ==================== Configuración CORS ====================
// Configurar origen para el frontend
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',')
  : ['http://localhost:10000']; // Asegurar que localhost:3000 está incluido

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS no permitido para este origen'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Solo funciona si origin es explícito, no '*'
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Permitir preflight requests


// ==================== Middlewares Esenciales ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(compression());
app.use(morgan('combined'));

// ==================== Rate Limiting Estratificado ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10000,
  message: 'Too many login attempts, please try again after an hour'
});

// Aplicar límites
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ==================== Configuración de Rutas ====================
app.use('/api/contracts', routes.contracts);
app.use('/api/auth', routes.auth);
app.use('/api/users', routes.users);

// ==================== Health Checks ====================
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));
app.get('/health/db', async (req, res) => {
  try {
    // Obtener una conexión desde el pool
    const connection = await oracledb.getPool().getConnection();
    
    // Probar la conexión con un ping
    await connection.ping();

    // Cerrar la conexión (muy importante para evitar fugas)
    await connection.close();

    // Enviar respuesta indicando que la BD está conectada
    res.json({ db: 'connected' });
  } catch (error) {
    // Si hay un error, devolver que la BD está desconectada
    res.status(500).json({ db: 'disconnected', error: error.message });
  }
});

// ==================== Manejo de Errores ====================
app.use(notFound);
app.use(errorHandler);

module.exports = app;