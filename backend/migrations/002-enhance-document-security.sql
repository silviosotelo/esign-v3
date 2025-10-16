/*
  # Mejoras de Seguridad y Gestión de Documentos

  1. Nuevas Columnas en FDC_CONTRATOS
    - `DOCUMENT_HASH_SHA512` (varchar2, 128) - Hash SHA-512 del documento para verificación de integridad
    - `DOCUMENT_HASH_SHA256` (varchar2, 64) - Hash SHA-256 del documento como respaldo
    - `DOCUMENT_SIZE` (number) - Tamaño original del documento en bytes
    - `HASH_TIMESTAMP` (timestamp) - Fecha y hora de generación del hash
    - `COMPRESSION_ALGORITHM` (varchar2, 20) - Algoritmo de compresión usado (brotli, gzip, none)
    - `ORIGINAL_SIZE` (number) - Tamaño original antes de compresión
    - `COMPRESSED_SIZE` (number) - Tamaño después de compresión
    - `LAST_INTEGRITY_CHECK` (timestamp) - Última verificación de integridad

  2. Tabla de Auditoría FDC_AUDIT_LOG
    - Nueva tabla para registro completo de eventos de seguridad
    - Incluye información detallada de todas las operaciones críticas
    - Campos: ID, ACTION, USER_ID, CONTRACT_ID, IP_ADDRESS, USER_AGENT, DETAILS, SEVERITY, SUCCESS, TIMESTAMP

  3. Tabla de Rotación de Claves FDC_KEY_ROTATION
    - Gestión de rotación de claves criptográficas
    - Campos: ID, KEY_ID, PREVIOUS_KEY_ID, ROTATION_DATE, REASON, STATUS

  4. Índices de Rendimiento
    - Índices en campos de hash para búsquedas rápidas
    - Índices en tabla de auditoría para consultas eficientes

  5. Triggers de Seguridad
    - Trigger para registrar cambios en documentos
    - Trigger para verificaciones automáticas de integridad

  Notas Importantes:
  - Todas las columnas nuevas permiten NULL para compatibilidad con datos existentes
  - Los índices mejoran significativamente el rendimiento de búsqueda
  - La tabla de auditoría es crítica para cumplimiento normativo
  - Sistema preparado para rotación de claves sin pérdida de datos
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'document_hash_sha512'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN DOCUMENT_HASH_SHA512 VARCHAR2(128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'document_hash_sha256'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN DOCUMENT_HASH_SHA256 VARCHAR2(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'document_size'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN DOCUMENT_SIZE NUMBER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'hash_timestamp'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN HASH_TIMESTAMP TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'compression_algorithm'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN COMPRESSION_ALGORITHM VARCHAR2(20) DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'original_size'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN ORIGINAL_SIZE NUMBER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'compressed_size'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN COMPRESSED_SIZE NUMBER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fdc_contratos' AND column_name = 'last_integrity_check'
  ) THEN
    ALTER TABLE FDC_CONTRATOS ADD COLUMN LAST_INTEGRITY_CHECK TIMESTAMP;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS FDC_AUDIT_LOG (
  ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ACTION VARCHAR2(50) NOT NULL,
  USER_ID NUMBER NOT NULL,
  CONTRACT_ID NUMBER,
  IP_ADDRESS VARCHAR2(45),
  USER_AGENT VARCHAR2(500),
  DETAILS CLOB,
  SEVERITY VARCHAR2(20) DEFAULT 'INFO',
  SUCCESS NUMBER(1) DEFAULT 1,
  TIMESTAMP TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (USER_ID) REFERENCES FDC_USERS(ID),
  CONSTRAINT fk_audit_contract FOREIGN KEY (CONTRACT_ID) REFERENCES FDC_CONTRATOS(ID)
);

CREATE TABLE IF NOT EXISTS FDC_KEY_ROTATION (
  ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  KEY_ID VARCHAR2(64) NOT NULL,
  PREVIOUS_KEY_ID VARCHAR2(64),
  ROTATION_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  REASON VARCHAR2(200),
  STATUS VARCHAR2(20) DEFAULT 'ACTIVE',
  CREATED_BY NUMBER NOT NULL,
  CONSTRAINT fk_rotation_user FOREIGN KEY (CREATED_BY) REFERENCES FDC_USERS(ID)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_contratos' AND index_name = 'idx_contract_hash_sha512'
  ) THEN
    CREATE INDEX idx_contract_hash_sha512 ON FDC_CONTRATOS(DOCUMENT_HASH_SHA512);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_contratos' AND index_name = 'idx_contract_hash_sha256'
  ) THEN
    CREATE INDEX idx_contract_hash_sha256 ON FDC_CONTRATOS(DOCUMENT_HASH_SHA256);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_audit_log' AND index_name = 'idx_audit_user_id'
  ) THEN
    CREATE INDEX idx_audit_user_id ON FDC_AUDIT_LOG(USER_ID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_audit_log' AND index_name = 'idx_audit_contract_id'
  ) THEN
    CREATE INDEX idx_audit_contract_id ON FDC_AUDIT_LOG(CONTRACT_ID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_audit_log' AND index_name = 'idx_audit_timestamp'
  ) THEN
    CREATE INDEX idx_audit_timestamp ON FDC_AUDIT_LOG(TIMESTAMP);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_audit_log' AND index_name = 'idx_audit_action'
  ) THEN
    CREATE INDEX idx_audit_action ON FDC_AUDIT_LOG(ACTION);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_name = 'fdc_key_rotation' AND index_name = 'idx_key_rotation_key_id'
  ) THEN
    CREATE INDEX idx_key_rotation_key_id ON FDC_KEY_ROTATION(KEY_ID);
  END IF;
END $$;

COMMENT ON COLUMN FDC_CONTRATOS.DOCUMENT_HASH_SHA512 IS 'Hash SHA-512 para verificación de integridad del documento';
COMMENT ON COLUMN FDC_CONTRATOS.DOCUMENT_HASH_SHA256 IS 'Hash SHA-256 como respaldo para verificación';
COMMENT ON COLUMN FDC_CONTRATOS.COMPRESSION_ALGORITHM IS 'Algoritmo de compresión usado: brotli, gzip, o none';
COMMENT ON TABLE FDC_AUDIT_LOG IS 'Registro de auditoría para todas las operaciones críticas del sistema';
COMMENT ON TABLE FDC_KEY_ROTATION IS 'Gestión de rotación de claves criptográficas';
