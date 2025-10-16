e-sign-backend
├── config/
│   ├── db.js                  # Configuración pool de conexiones Oracle
│   └── passportConfig.js      # Autenticación adaptada a estructura Oracle
├── controllers/
│   ├── authController.js      # Usa servicios Oracle (login/register)
│   ├── contractController.js  # Operaciones con contratos usando SQL
│   └── userController.js      # Gestiona usuarios con repositorio SQL
├── migrations/                # Nuevo: Scripts de migración SQL
│   └── 001-create-users.sql
├── models/
│   ├── contractModel.js       # Clase Contract con mapeo Oracle
│   └── userModel.js           # Clase User con métodos toOracle()/fromOracle()
├── repositories/              # Nuevo: Capa de acceso a datos
│   ├── contractRepository.js  # Consultas SQL para contratos
│   └── userRepository.js      # Queries SQL para usuarios
├── services/
│   ├── contractService.js     # Lógica de negocio + transacciones Oracle
│   ├── dbService.js           # Utilidades de conexión
│   ├── emailService.js        # Sin cambios (independiente de BD)
│   └── userService.js         # Usa repositorio + argon2
├── utils/
│   ├── authUtils.js           # JWT con ID numérico y roles Oracle
│   └── signatureUtils.js      # Firma con claves en OracleDB
└── .env                       # Variables Oracle (USER, PASSWORD, etc.)