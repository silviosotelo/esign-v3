# Arquitectura de Seguridad - Sistema de Gestión de Documentos

## Resumen Ejecutivo

Este documento describe las mejoras implementadas en el sistema de gestión de documentos, enfocándose en seguridad, escalabilidad y robustez.

## Componentes Principales

### 1. EncryptionService

**Ubicación**: `services/encryptionService.js`

**Responsabilidades**:
- Cifrado simétrico de datos usando AES-256-GCM
- Derivación segura de claves usando PBKDF2 con 310,000 iteraciones
- Autenticación de datos cifrados con auth tags
- Generación de passphrases seguras y normalizadas

**Mejoras Clave**:
- **AES-256-GCM**: Modo autenticado que previene modificaciones no autorizadas
- **PBKDF2**: 310,000 iteraciones (estándar OWASP 2023)
- **Salt único**: 32 bytes por operación para prevenir ataques rainbow table
- **Auth Tag**: 16 bytes para verificación de integridad

**Ejemplo de Uso**:
```javascript
const encryptionService = require('./services/encryptionService');

const encryptedData = encryptionService.encrypt(
  documentBuffer,
  userPassphrase
);

const decryptedData = encryptionService.decrypt(
  encryptedData,
  userPassphrase
);
```

### 2. CryptographicService

**Ubicación**: `services/cryptographicService.js`

**Responsabilidades**:
- Generación de pares de claves RSA-4096
- Firma digital usando RSA-SHA512
- Verificación de firmas digitales
- Gestión segura de claves privadas cifradas

**Mejoras Clave**:
- **RSA-4096**: Módulo de 4096 bits para máxima seguridad
- **SHA-512**: Algoritmo de hash más robusto que SHA-256
- **Claves privadas cifradas**: Nunca se almacenan en texto plano
- **Auditoría integrada**: Registro de todas las operaciones de firma

**Ejemplo de Uso**:
```javascript
const cryptographicService = require('./services/cryptographicService');

const { publicKey, keyId } = await cryptographicService.generateKeyPair({
  id: userId,
  email: userEmail,
  document: userDoc
});

const signatureResult = await cryptographicService.signData(
  dataToSign,
  keyId,
  userPassphrase,
  userId
);
```

### 3. DocumentIntegrityService

**Ubicación**: `services/documentIntegrityService.js`

**Responsabilidades**:
- Generación de hashes SHA-512 y SHA-256 para documentos
- Verificación de integridad mediante comparación de hashes
- Almacenamiento y recuperación de hashes
- Generación de manifiestos de checksum

**Mejoras Clave**:
- **Doble hash**: SHA-512 como principal, SHA-256 como respaldo
- **Verificación de tamaño**: Comprobación adicional del tamaño del archivo
- **Manifiestos**: Estructura completa de metadatos del documento
- **Cadena de verificación**: Validación completa del historial del documento

**Ejemplo de Uso**:
```javascript
const documentIntegrityService = require('./services/documentIntegrityService');

const hashData = documentIntegrityService.generateDocumentHash(pdfBuffer);

await documentIntegrityService.storeDocumentHash(contractId, hashData);

const verification = await documentIntegrityService.verifyDocumentChain(contractId);
```

### 4. AuditService

**Ubicación**: `services/auditService.js`

**Responsabilidades**:
- Registro completo de eventos de seguridad
- Detección de actividad anómala
- Consultas de historial de auditoría
- Alertas de seguridad

**Mejoras Clave**:
- **Registro granular**: Todos los eventos críticos son registrados
- **Severidad multinivel**: INFO, WARNING, ERROR, CRITICAL
- **Detección de anomalías**: Identificación automática de patrones sospechosos
- **Cumplimiento normativo**: Trazabilidad completa de operaciones

**Eventos Auditados**:
- Creación de documentos
- Firma de documentos
- Visualización de documentos
- Descarga de documentos
- Generación de claves
- Verificación de firmas
- Verificación de integridad
- Intentos de acceso no autorizado

**Ejemplo de Uso**:
```javascript
const auditService = require('./services/auditService');

await auditService.logDocumentSigned(
  userId,
  contractId,
  ipAddress,
  signatureDetails
);

const securityEvents = await auditService.getSecurityEvents(userId, 30);

const anomalies = await auditService.detectAnomalousActivity(userId, 60);
```

### 5. DocumentStorageService

**Ubicación**: `services/documentStorageService.js`

**Responsabilidades**:
- Compresión inteligente de documentos
- Descompresión transparente
- Gestión de metadatos de almacenamiento
- Estadísticas de almacenamiento

**Mejoras Clave**:
- **Compresión Brotli**: Superior a gzip en ratio de compresión
- **Umbral inteligente**: Solo comprime documentos >100KB
- **Soporte multi-algoritmo**: Brotli y Gzip disponibles
- **Transparencia**: Descompresión automática al recuperar

**Beneficios**:
- Ahorro de espacio: 40-70% en documentos PDF típicos
- Menor transferencia de red
- Costos reducidos de almacenamiento
- Sin impacto en la experiencia del usuario

**Ejemplo de Uso**:
```javascript
const documentStorageService = require('./services/documentStorageService');

const storeResult = await documentStorageService.storeDocument({
  fileName: 'contrato.pdf',
  directory: 'GESTION_ONLINE',
  content: pdfBuffer,
  fileMimeType: 'application/pdf',
  contractId: contractId,
  compress: true
});

const documentBuffer = await documentStorageService.retrieveDocument(
  filePath,
  true
);
```

## Arquitectura de Base de Datos

### Nuevas Columnas en FDC_CONTRATOS

```sql
DOCUMENT_HASH_SHA512 VARCHAR2(128)
DOCUMENT_HASH_SHA256 VARCHAR2(64)
DOCUMENT_SIZE NUMBER
HASH_TIMESTAMP TIMESTAMP
COMPRESSION_ALGORITHM VARCHAR2(20)
ORIGINAL_SIZE NUMBER
COMPRESSED_SIZE NUMBER
LAST_INTEGRITY_CHECK TIMESTAMP
```

### Nueva Tabla: FDC_AUDIT_LOG

```sql
CREATE TABLE FDC_AUDIT_LOG (
  ID NUMBER PRIMARY KEY,
  ACTION VARCHAR2(50) NOT NULL,
  USER_ID NUMBER NOT NULL,
  CONTRACT_ID NUMBER,
  IP_ADDRESS VARCHAR2(45),
  USER_AGENT VARCHAR2(500),
  DETAILS CLOB,
  SEVERITY VARCHAR2(20),
  SUCCESS NUMBER(1),
  TIMESTAMP TIMESTAMP
);
```

### Nueva Tabla: FDC_KEY_ROTATION

```sql
CREATE TABLE FDC_KEY_ROTATION (
  ID NUMBER PRIMARY KEY,
  KEY_ID VARCHAR2(64) NOT NULL,
  PREVIOUS_KEY_ID VARCHAR2(64),
  ROTATION_DATE TIMESTAMP,
  REASON VARCHAR2(200),
  STATUS VARCHAR2(20),
  CREATED_BY NUMBER NOT NULL
);
```

## Flujo de Seguridad Mejorado

### 1. Creación de Contrato

```
Usuario → ContractService → CryptographicService → EncryptionService
    ↓
DocumentStorageService → DocumentIntegrityService → AuditService
    ↓
Base de Datos
```

### 2. Firma de Contrato

```
Usuario → ContractService → CryptographicService.signData
    ↓
AuditService.logDocumentSigned → DocumentIntegrityService.verifyDocumentChain
    ↓
PDFGeneration → DocumentStorageService.storeDocument
    ↓
Base de Datos
```

### 3. Verificación de Integridad

```
Usuario → DocumentIntegrityService.verifyDocumentChain
    ↓
DBService.getDocumentContent → DocumentStorageService.decompressDocument
    ↓
Hash Comparison → AuditService.logIntegrityCheck
    ↓
Result → Usuario
```

## Consideraciones de Seguridad

### Cifrado
- **AES-256-GCM**: Estándar actual para cifrado simétrico
- **RSA-4096**: Seguro hasta 2030+ según estimaciones
- **PBKDF2**: Protección contra ataques de fuerza bruta

### Integridad
- **Doble hash**: Redundancia para mayor seguridad
- **Verificación de tamaño**: Detección temprana de corrupción
- **Auth tags**: Prevención de modificaciones no detectadas

### Auditoría
- **Registro completo**: Todas las operaciones críticas
- **Detección de anomalías**: Identificación proactiva de amenazas
- **Cumplimiento**: Trazabilidad para auditorías externas

### Almacenamiento
- **Compresión**: Reducción de superficie de ataque
- **Metadatos**: Información completa sin exponer datos
- **Separación**: Contenido y metadatos en estructuras separadas

## Migración y Compatibilidad

### Datos Existentes
- Las nuevas columnas permiten NULL para compatibilidad
- Los documentos existentes funcionan sin cambios
- Migración gradual recomendada

### Proceso de Migración Sugerido

1. **Aplicar migración de base de datos**:
```bash
Ejecutar: backend/migrations/002-enhance-document-security.sql
```

2. **Migrar datos existentes** (opcional):
```javascript
// Script para actualizar documentos existentes
const contracts = await getAllContracts();

for (const contract of contracts) {
  const documentBuffer = await getDocument(contract.FILE_PATH);
  const hashData = documentIntegrityService.generateDocumentHash(documentBuffer);
  await documentIntegrityService.storeDocumentHash(contract.ID, hashData);
}
```

3. **Activar nuevas funciones**:
- Habilitar compresión en nuevos documentos
- Activar auditoría completa
- Implementar verificaciones periódicas de integridad

## Mantenimiento

### Verificación de Integridad Periódica

Recomendado: Ejecutar semanalmente

```javascript
const scheduleIntegrityChecks = async () => {
  const contracts = await getAllActiveContracts();

  for (const contract of contracts) {
    const result = await documentIntegrityService.verifyDocumentChain(
      contract.ID
    );

    if (!result.isValid) {
      await auditService.logIntegrityCheck(
        contract.USER_ID,
        contract.ID,
        result
      );
      await notifySecurityTeam(contract.ID, result);
    }
  }
};
```

### Rotación de Claves

Recomendado: Cada 90 días

```javascript
const rotateKeys = async (userId, reason) => {
  const oldKeyId = await getCurrentKeyId(userId);
  const { publicKey, keyId: newKeyId } = await cryptographicService.generateKeyPair(
    userPassphrase
  );

  await KeyRotationRepository.create({
    keyId: newKeyId,
    previousKeyId: oldKeyId,
    reason,
    createdBy: userId
  });
};
```

### Limpieza de Auditoría

Recomendado: Retener 2 años, archivar después

```javascript
const archiveOldAuditLogs = async () => {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const oldLogs = await auditService.getAuditHistory({
    endDate: twoYearsAgo.toISOString()
  });

  await archiveToSecureStorage(oldLogs);
  await deleteArchivedLogs(twoYearsAgo);
};
```

## Rendimiento

### Optimizaciones Implementadas
- Índices en columnas de hash
- Índices en tabla de auditoría
- Compresión para reducir I/O
- Validación asíncrona cuando sea posible

### Métricas Esperadas
- Tiempo de firma: <500ms
- Verificación de integridad: <200ms
- Compresión: 40-70% de reducción
- Overhead de auditoría: <50ms por operación

## Cumplimiento Normativo

Este sistema proporciona las bases para cumplir con:
- **GDPR**: Auditoría completa, cifrado de datos
- **SOC 2**: Controles de acceso, registro de eventos
- **ISO 27001**: Gestión de claves, integridad de datos
- **eIDAS**: Firma digital robusta, no repudio

## Soporte

Para preguntas o problemas relacionados con la arquitectura de seguridad, consultar con el equipo de seguridad del proyecto.

## Versión

Documentación v1.0 - Fecha: Octubre 2025
