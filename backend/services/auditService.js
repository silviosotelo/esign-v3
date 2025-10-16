const DBService = require('./dbService');
const logger = require('../utils/logger');

const AUDIT_ACTIONS = {
  DOCUMENT_CREATED: 'DOCUMENT_CREATED',
  DOCUMENT_SIGNED: 'DOCUMENT_SIGNED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  DOCUMENT_UPDATED: 'DOCUMENT_UPDATED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  KEY_GENERATED: 'KEY_GENERATED',
  KEY_USED: 'KEY_USED',
  SIGNATURE_ADDED: 'SIGNATURE_ADDED',
  SIGNATURE_VERIFIED: 'SIGNATURE_VERIFIED',
  ENCRYPTION_PERFORMED: 'ENCRYPTION_PERFORMED',
  DECRYPTION_PERFORMED: 'DECRYPTION_PERFORMED',
  INTEGRITY_CHECK: 'INTEGRITY_CHECK',
  FAILED_AUTHENTICATION: 'FAILED_AUTHENTICATION',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS'
};

const AUDIT_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

class AuditService {
  async logAuditEvent(auditData) {
    try {
      const {
        action,
        userId,
        contractId,
        ipAddress,
        userAgent,
        details,
        severity = AUDIT_SEVERITY.INFO,
        success = true
      } = auditData;

      if (!action || !userId) {
        throw new Error('Acción y userId son requeridos para auditoría');
      }

      const query = `
        INSERT INTO FDC_AUDIT_LOG (
          ACTION,
          USER_ID,
          CONTRACT_ID,
          IP_ADDRESS,
          USER_AGENT,
          DETAILS,
          SEVERITY,
          SUCCESS,
          TIMESTAMP
        ) VALUES (
          :action,
          :userId,
          :contractId,
          :ipAddress,
          :userAgent,
          :details,
          :severity,
          :success,
          CURRENT_TIMESTAMP
        )
      `;

      await DBService.executeQuery(query, {
        action,
        userId,
        contractId: contractId || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        details: details ? JSON.stringify(details) : null,
        severity,
        success: success ? 1 : 0
      });

      logger.info(`Evento de auditoría registrado: ${action}`, {
        userId,
        contractId,
        severity
      });

      return { success: true };
    } catch (error) {
      logger.error('Error registrando evento de auditoría:', error);
      throw new Error(`Error en auditoría: ${error.message}`);
    }
  }

  async logDocumentCreation(userId, contractId, ipAddress, details) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.DOCUMENT_CREATED,
      userId,
      contractId,
      ipAddress,
      details,
      severity: AUDIT_SEVERITY.INFO
    });
  }

  async logDocumentSigned(userId, contractId, ipAddress, signatureDetails) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.DOCUMENT_SIGNED,
      userId,
      contractId,
      ipAddress,
      details: signatureDetails,
      severity: AUDIT_SEVERITY.INFO
    });
  }

  async logSignatureAdded(userId, contractId, ipAddress, signerType) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.SIGNATURE_ADDED,
      userId,
      contractId,
      ipAddress,
      details: { signerType },
      severity: AUDIT_SEVERITY.INFO
    });
  }

  async logKeyGenerated(userId, keyId, ipAddress) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.KEY_GENERATED,
      userId,
      ipAddress,
      details: { keyId },
      severity: AUDIT_SEVERITY.INFO
    });
  }

  async logIntegrityCheck(userId, contractId, result) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.INTEGRITY_CHECK,
      userId,
      contractId,
      details: result,
      severity: result.isValid ? AUDIT_SEVERITY.INFO : AUDIT_SEVERITY.WARNING,
      success: result.isValid
    });
  }

  async logFailedAuthentication(userId, ipAddress, reason) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.FAILED_AUTHENTICATION,
      userId,
      ipAddress,
      details: { reason },
      severity: AUDIT_SEVERITY.WARNING,
      success: false
    });
  }

  async logUnauthorizedAccess(userId, contractId, ipAddress, attemptedAction) {
    return this.logAuditEvent({
      action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
      userId,
      contractId,
      ipAddress,
      details: { attemptedAction },
      severity: AUDIT_SEVERITY.ERROR,
      success: false
    });
  }

  async getAuditHistory(filters = {}) {
    try {
      let query = 'SELECT * FROM FDC_AUDIT_LOG WHERE 1=1';
      const params = {};

      if (filters.userId) {
        query += ' AND USER_ID = :userId';
        params.userId = filters.userId;
      }

      if (filters.contractId) {
        query += ' AND CONTRACT_ID = :contractId';
        params.contractId = filters.contractId;
      }

      if (filters.action) {
        query += ' AND ACTION = :action';
        params.action = filters.action;
      }

      if (filters.severity) {
        query += ' AND SEVERITY = :severity';
        params.severity = filters.severity;
      }

      if (filters.startDate) {
        query += ' AND TIMESTAMP >= :startDate';
        params.startDate = filters.startDate;
      }

      if (filters.endDate) {
        query += ' AND TIMESTAMP <= :endDate';
        params.endDate = filters.endDate;
      }

      query += ' ORDER BY TIMESTAMP DESC';

      if (filters.limit) {
        query += ` FETCH FIRST :limit ROWS ONLY`;
        params.limit = filters.limit;
      }

      const result = await DBService.executeQuery(query, params);

      return result.rows || [];
    } catch (error) {
      logger.error('Error obteniendo historial de auditoría:', error);
      throw new Error(`Error al obtener auditoría: ${error.message}`);
    }
  }

  async getSecurityEvents(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.getAuditHistory({
      userId,
      startDate: startDate.toISOString(),
      severity: AUDIT_SEVERITY.WARNING
    });
  }

  async detectAnomalousActivity(userId, timeWindowMinutes = 60) {
    try {
      const query = `
        SELECT
          ACTION,
          COUNT(*) as event_count,
          MIN(TIMESTAMP) as first_event,
          MAX(TIMESTAMP) as last_event
        FROM FDC_AUDIT_LOG
        WHERE USER_ID = :userId
          AND TIMESTAMP >= CURRENT_TIMESTAMP - INTERVAL '${timeWindowMinutes}' MINUTE
        GROUP BY ACTION
        HAVING COUNT(*) > 10
        ORDER BY event_count DESC
      `;

      const result = await DBService.executeQuery(query, { userId });

      const anomalies = result.rows || [];

      if (anomalies.length > 0) {
        logger.warn(`Actividad anómala detectada para usuario ${userId}`, {
          anomalies
        });
      }

      return anomalies;
    } catch (error) {
      logger.error('Error detectando actividad anómala:', error);
      return [];
    }
  }
}

module.exports = new AuditService();
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
module.exports.AUDIT_SEVERITY = AUDIT_SEVERITY;
