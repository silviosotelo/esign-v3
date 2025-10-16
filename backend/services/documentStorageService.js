const zlib = require('zlib');
const { promisify } = require('util');
const DBService = require('./dbService');
const documentIntegrityService = require('./documentIntegrityService');
const logger = require('../utils/logger');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

const COMPRESSION_CONFIG = {
  GZIP: {
    level: zlib.constants.Z_BEST_COMPRESSION
  },
  BROTLI: {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: 0
    }
  },
  THRESHOLD_KB: 100
};

class DocumentStorageService {
  async compressDocument(documentBuffer, algorithm = 'brotli') {
    try {
      if (!Buffer.isBuffer(documentBuffer)) {
        throw new Error('El documento debe ser un Buffer');
      }

      const originalSize = documentBuffer.length;
      const thresholdBytes = COMPRESSION_CONFIG.THRESHOLD_KB * 1024;

      if (originalSize < thresholdBytes) {
        logger.info(`Documento de ${originalSize} bytes no requiere compresión`);
        return {
          compressed: documentBuffer,
          algorithm: 'none',
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1.0
        };
      }

      let compressed;
      let usedAlgorithm = algorithm;

      if (algorithm === 'brotli') {
        compressed = await brotliCompressAsync(
          documentBuffer,
          COMPRESSION_CONFIG.BROTLI
        );
      } else if (algorithm === 'gzip') {
        compressed = await gzipAsync(documentBuffer, COMPRESSION_CONFIG.GZIP);
      } else {
        throw new Error(`Algoritmo de compresión no soportado: ${algorithm}`);
      }

      const compressedSize = compressed.length;
      const compressionRatio = originalSize / compressedSize;

      logger.info(
        `Documento comprimido: ${originalSize} → ${compressedSize} bytes (${compressionRatio.toFixed(2)}x)`
      );

      return {
        compressed,
        algorithm: usedAlgorithm,
        originalSize,
        compressedSize,
        compressionRatio
      };
    } catch (error) {
      logger.error('Error comprimiendo documento:', error);
      throw new Error(`Error en compresión: ${error.message}`);
    }
  }

  async decompressDocument(compressedBuffer, algorithm) {
    try {
      if (!Buffer.isBuffer(compressedBuffer)) {
        throw new Error('El documento comprimido debe ser un Buffer');
      }

      if (algorithm === 'none') {
        return compressedBuffer;
      }

      let decompressed;

      if (algorithm === 'brotli') {
        decompressed = await brotliDecompressAsync(compressedBuffer);
      } else if (algorithm === 'gzip') {
        decompressed = await gunzipAsync(compressedBuffer);
      } else {
        throw new Error(`Algoritmo de descompresión no soportado: ${algorithm}`);
      }

      logger.info(`Documento descomprimido: ${decompressed.length} bytes`);

      return decompressed;
    } catch (error) {
      logger.error('Error descomprimiendo documento:', error);
      throw new Error(`Error en descompresión: ${error.message}`);
    }
  }

  async storeDocument(params) {
    try {
      const { fileName, directory, content, fileMimeType, contractId, compress = true } = params;

      if (!Buffer.isBuffer(content)) {
        throw new Error('El contenido debe ser un Buffer');
      }

      const hashData = documentIntegrityService.generateDocumentHash(content);

      let finalContent = content;
      let compressionInfo = null;

      if (compress) {
        const compressionResult = await this.compressDocument(content, 'brotli');
        finalContent = compressionResult.compressed;
        compressionInfo = {
          algorithm: compressionResult.algorithm,
          originalSize: compressionResult.originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio
        };
      }

      const uploadResult = await DBService.uploadDocument({
        fileName,
        directory,
        content: finalContent,
        fileMimeType,
        itemName: null
      });

      if (contractId && hashData) {
        await documentIntegrityService.storeDocumentHash(contractId, hashData);
      }

      logger.info(`Documento almacenado: ${uploadResult.fullPath}`, {
        originalSize: content.length,
        compression: compressionInfo
      });

      return {
        ...uploadResult,
        hashData,
        compressionInfo
      };
    } catch (error) {
      logger.error('Error almacenando documento:', error);
      throw new Error(`Error al almacenar documento: ${error.message}`);
    }
  }

  async retrieveDocument(filePath, decompress = true) {
    try {
      const documentBuffer = await DBService.getDocumentContent(filePath, false);

      if (!documentBuffer) {
        throw new Error('Documento no encontrado');
      }

      const query = `
        SELECT COMPRESSION_ALGORITHM
        FROM FDC_CONTRATOS
        WHERE FILE_PATH = :filePath
      `;

      const result = await DBService.executeQuery(query, { filePath });

      let finalDocument = documentBuffer;

      if (decompress && result.rows && result.rows.length > 0) {
        const compressionAlgorithm = result.rows[0].COMPRESSION_ALGORITHM;

        if (compressionAlgorithm && compressionAlgorithm !== 'none') {
          finalDocument = await this.decompressDocument(
            documentBuffer,
            compressionAlgorithm
          );
        }
      }

      logger.info(`Documento recuperado: ${filePath}, tamaño: ${finalDocument.length} bytes`);

      return finalDocument;
    } catch (error) {
      logger.error('Error recuperando documento:', error);
      throw new Error(`Error al recuperar documento: ${error.message}`);
    }
  }

  async updateDocumentStorage(contractId, updateData) {
    try {
      const query = `
        UPDATE FDC_CONTRATOS
        SET
          FILE_PATH = :filePath,
          FILE_NAME = :fileName,
          FILE_MIMETYPE = :fileMimeType,
          COMPRESSION_ALGORITHM = :compressionAlgorithm,
          ORIGINAL_SIZE = :originalSize,
          COMPRESSED_SIZE = :compressedSize
        WHERE ID = :contractId
      `;

      await DBService.executeQuery(query, {
        filePath: updateData.filePath,
        fileName: updateData.fileName,
        fileMimeType: updateData.fileMimeType,
        compressionAlgorithm: updateData.compressionAlgorithm || 'none',
        originalSize: updateData.originalSize || 0,
        compressedSize: updateData.compressedSize || 0,
        contractId
      });

      logger.info(`Metadatos de almacenamiento actualizados para contrato ${contractId}`);

      return { success: true, contractId };
    } catch (error) {
      logger.error('Error actualizando metadatos de almacenamiento:', error);
      throw new Error(`Error al actualizar almacenamiento: ${error.message}`);
    }
  }

  calculateStorageStatistics(contracts) {
    const stats = {
      totalContracts: contracts.length,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      averageCompressionRatio: 0,
      spaceSaved: 0
    };

    for (const contract of contracts) {
      if (contract.ORIGINAL_SIZE) {
        stats.totalOriginalSize += contract.ORIGINAL_SIZE;
      }
      if (contract.COMPRESSED_SIZE) {
        stats.totalCompressedSize += contract.COMPRESSED_SIZE;
      }
    }

    if (stats.totalCompressedSize > 0) {
      stats.averageCompressionRatio =
        stats.totalOriginalSize / stats.totalCompressedSize;
      stats.spaceSaved = stats.totalOriginalSize - stats.totalCompressedSize;
    }

    return stats;
  }
}

module.exports = new DocumentStorageService();
