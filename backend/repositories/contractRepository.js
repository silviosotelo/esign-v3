const DBService = require('../services/dbService');
const Contract = require('../models/contractModel');
const { oracledb } = require('../config/db');

class ContractRepository {
  async create(contractData) {
    try {
      const contract = new Contract(contractData);
      const result = await DBService.executeQuery(
        `INSERT INTO FDC_CONTRATOS (
          USER_ID, TITLE, CONTENT, FILE_PATH, FILE_MIMETYPE, FILE_NAME, STATUS, PUBLIC_KEY, KEY_ID
        ) VALUES (
          :userId, :title, :content, :file_path, :file_mimetype, :file_name, :status, :publicKey, :keyId
        ) RETURNING ID INTO :id`,
        {
          userId: contract.userId,
          title: contract.title,
          content: contract.content,
          file_path: contract.file_path,
          file_mimetype: contract.file_mimetype,
          file_name: contract.file_name,
          status: contract.status,
          publicKey: contract.publicKey,
          keyId: contract.keyId,
          id: { type: DBService.oracledb.NUMBER, dir: DBService.oracledb.BIND_OUT }
        }
      );
      return result.outBinds.id[0];
    } catch (error) {
      throw new Error(`Error creating contract: ${error.message}`);
    }
  }

  async findByUserId(userId) {
    try {
      const result = await DBService.executeQuery(
        `SELECT * FROM FDC_CONTRATOS 
         WHERE USER_ID = :userId 
         ORDER BY CREATED_AT DESC`,
        { userId }
      );
      return DBService.mapResult(result).map(row => Contract.fromOracle(row));
    } catch (error) {
      throw new Error(`Error fetching contracts: ${error.message}`);
    }
  }

  async update(contractId, updateData) {
    try {
      const contract = await this.findContractById(contractId);
      const updatedContract = new Contract({ ...contract, ...updateData });

      await DBService.executeQuery(
        `UPDATE FDC_CONTRATOS SET
          STATUS = :status,
          SIGNATURE = :signature,
          PUBLIC_KEY = :publicKey,
          SIGNED_AT = :signedAt,
          SIGNED_BY = :signedBy,
          ADDITIONAL_SIGNATURES = :additionalSignatures
         WHERE ID = :id`,
        {
          status: updatedContract.status,
          signature: updatedContract.signature,
          publicKey: updatedContract.publicKey,
          signedAt: updatedContract.signedAt,
          signedBy: JSON.stringify(updatedContract.signedBy),
          additionalSignatures: JSON.stringify(updatedContract.additionalSignatures),
          id: contractId
        }
      );

      return updatedContract;
    } catch (error) {
      throw new Error(`Error updating contract: ${error.message}`);
    }
  }

  async updatePath(contractId, updateData) {
    try {
      const contract = await this.findContractById(contractId);
      const updatedContract = new Contract({ ...contract, ...updateData });

      await DBService.executeQuery(
        `UPDATE FDC_CONTRATOS SET
          FILE_PATH = :file_path,
          FILE_NAME = :file_name,
          FILE_MIMETYPE = :file_mimetype
         WHERE ID = :id`,
        {
          file_path: updatedContract.file_path,
          file_name: updatedContract.file_name,
          file_mimetype: updatedContract.file_mimetype,
          id: contractId
        }
      );

      return updatedContract;
    } catch (error) {
      throw new Error(`Error updating contract file path: ${error.message}`);
    }
  }

  async findContractById(contractId) {
    try {
      // Convertir a número si viene como string
      const contractIdNumber = Number(contractId);
      const result = await DBService.executeQuery(
        `SELECT * FROM FDC_CONTRATOS WHERE ID = :contractId`,
        { contractId: { val: contractIdNumber, type: oracledb.DB_TYPE_NUMBER } }
      );
      if (!result.rows || result.rows.length === 0) {
        console.warn(`No se encontró contrato con ID: ${contractId}`);
        return null; // Retornar null en lugar de llamar a `fromOracle()`
      }

      const mappedResult = DBService.mapResult(result, true);

      if (!mappedResult) {
        console.warn('`mapResult` devolvió un valor nulo o indefinido.');
        return null;
      }

      return Contract.fromOracle(mappedResult);
    } catch (error) {
      console.error('Error en findById:', error);
      throw new Error(`Error findById contract: ${error.message}`);
    }
  }

  /*async updateSignatures(contractId, updateData) {
    try {
      const contract = await this.findById(contractId);
      const updatedContract = new Contract({ ...contract, ...updateData });
      console.log('updatedContract: ', updatedContract);
      await DBService.executeQuery(
        `UPDATE FDC_CONTRATOS SET
          SIGNATURES = :additionalSignatures
         WHERE ID = :id`,
        {
          additionalSignatures: updatedContract.additionalSignatures,
          id: contractId
        }
      );

      return updatedContract;
    } catch (error) {
      throw new Error(`Error updating contract file path: ${error.message}`);
    }
  }*/

  /**
     * Actualiza las firmas adicionales de un contrato
     * @param {string} contractId - ID del contrato
     * @param {object} data - Datos para actualizar
     * @returns {Promise<object>} - Contrato actualizado
     */
  async updateSignatures(contractId, data) {
    try {
      // Convertir array de firmas adicionales a JSON string
      let additionalSignaturesJson = null;

      if (data.additionalSignatures && Array.isArray(data.additionalSignatures)) {
        additionalSignaturesJson = JSON.stringify(data.additionalSignatures);
        console.log('additionalSignaturesJson:', additionalSignaturesJson.substring(0, 100) + '...');
      }

      // Consulta SQL para actualizar las firmas adicionales
      const query = `
      UPDATE FDC_CONTRATOS 
      SET additional_signatures = :additionalSignatures
      WHERE id = :contractId
    `;

      // Parámetros para la consulta
      const params = {
        additionalSignatures: additionalSignaturesJson,
        contractId: contractId
      };

      // Ejecutar la consulta
      const result = await DBService.executeQuery(query, params);
      console.log('updateSignatures: ', result);

      // Verificar que se actualizó correctamente
      if (!result /*|| !result.outBinds || !result.outBinds.outputId*/) {
        throw new Error('No se pudo actualizar las firmas adicionales del contrato');
      }

      // Obtener el contrato actualizado
      const updatedContract = await this.findById(contractId);

      return updatedContract;
    } catch (error) {
      console.error('Error updating contract signatures:', error);
      throw new Error(`Error updating contract signatures: ${error.message}`);
    }
  }

  /**
   * Encuentra un contrato por su ID
   * @param {string} contractId - ID del contrato
   * @returns {Promise<object>} - Contrato encontrado
   */
  async findById(contractId) {
    try {
      const query = `
      SELECT * FROM FDC_CONTRATOS WHERE id = :contractId
    `;

      const result = await DBService.executeQuery(query, { contractId });

      if (!result || !result.rows || result.rows.length === 0) {
        return null;
      }

      const contract = result.rows[0];

      // Convertir el JSON string de firmas adicionales a array si existe
      if (contract.ADDITIONAL_SIGNATURES) {
        try {
          contract.additionalSignatures = JSON.parse(contract.ADDITIONAL_SIGNATURES);
        } catch (parseError) {
          console.warn('Error parsing additional signatures:', parseError);
          contract.additionalSignatures = [];
        }
      } else {
        contract.additionalSignatures = [];
      }

      return contract;
    } catch (error) {
      console.error('Error finding contract by ID:', error);
      throw new Error(`Error finding contract by ID: ${error.message}`);
    }
  }


}


module.exports = new ContractRepository();