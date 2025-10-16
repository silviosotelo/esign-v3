const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');

// Funciones auxiliares mejoradas para conversión de LOBs
async function convertLobToString(lob) {
  return new Promise((resolve, reject) => {
    let result = '';

    lob.setEncoding('utf8');  // Establecer la codificación antes de leer

    lob.on('error', err => {
      reject(err);
    });

    lob.on('data', chunk => {
      result += chunk;
    });

    lob.on('end', () => {
      resolve(result);
    });
  });
}

async function convertLobToBuffer(lob) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    // No establecer codificación para BLOBs, queremos datos binarios
    lob.on('error', err => {
      reject(err);
    });

    lob.on('data', chunk => {
      chunks.push(chunk);
    });

    lob.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });
  });
}

class DBService {
  static oracledb = oracledb;
  static async executeQuery(query, params = {}, options = {}) {
    let connection;
    try {
      connection = await oracledb.getConnection();

      // Configurar opciones por defecto
      const defaultOptions = {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          // Por defecto, obtener CLOB y BLOB como valores directos
          ENCRYPTED_PRIVATE_KEY: { type: oracledb.STRING }
        }
      };

      // Combinar opciones
      const finalOptions = { ...defaultOptions, ...options };

      // Ejecutar la consulta
      const result = await connection.execute(query, params, finalOptions);

      // Si la consulta devuelve filas
      if (result.rows && result.rows.length > 0) {
        // Procesar LOBs antes de cerrar la conexión
        for (const row of result.rows) {
          for (const [key, value] of Object.entries(row)) {
            if (value && value.constructor && value.constructor.name === 'Lob') {
              if (value.type === oracledb.CLOB) {
                row[key] = await convertLobToString(value);
              } else if (value.type === oracledb.BLOB) {
                row[key] = await convertLobToBuffer(value);
              }
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error en DBService.executeQuery:', error.message);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error al cerrar la conexión:', err.message);
        }
      }
    }
  }

  static mapResult(result, isSingle = false) {
    if (!result.rows) return isSingle ? null : [];
    return isSingle ? result.rows[0] : result.rows;
  }

  /**
   * Ejecuta un procedimiento PL/SQL que devuelve un BLOB
   * @param {string} plsqlBlock - Bloque PL/SQL a ejecutar
   * @param {Object} bindParams - Parámetros para vincular al procedimiento
   * @param {Object} options - Opciones adicionales para la ejecución
   * @returns {Promise<Object>} - Resultado con los parámetros de salida
   */
  static async executePLSQL(plsqlBlock, bindParams = {}, options = {}) {
    let connection;
    try {
      connection = await oracledb.getConnection();

      // Configuración específica para trabajar con LOBs
      oracledb.fetchAsBuffer = [oracledb.BLOB];

      // Configurar opciones por defecto
      const defaultOptions = {
        autoCommit: true
      };

      // Combinar opciones
      const finalOptions = { ...defaultOptions, ...options };

      // Ejecutar el bloque PL/SQL
      const result = await connection.execute(plsqlBlock, bindParams, finalOptions);

      // Procesar los parámetros de salida que son LOBs
      const outputParams = {};

      if (result.outBinds) {
        for (const [key, value] of Object.entries(result.outBinds)) {
          // Verificar si es un LOB usando un enfoque más robusto
          if (value && value.constructor && value.constructor.name === 'Lob') {
            if (value.type === oracledb.CLOB) {
              outputParams[key] = await convertLobToString(value);
            } else if (value.type === oracledb.BLOB) {
              outputParams[key] = await convertLobToBuffer(value);
            }
          } else {
            outputParams[key] = value;
          }
        }
      }

      return outputParams;
    } catch (error) {
      console.error('Error en DBService.executePLSQL:', error.message, error.stack);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error al cerrar la conexión:', err.message);
        }
      }
    }
  }

  /**
   * Obtiene un documento del sistema de archivos mediante un procedimiento PL/SQL
   * @param {string} filePath - Ruta del archivo a obtener
   * @param {boolean} saveFile - Indica si el archivo debe guardarse localmente
   * @returns {Promise<Buffer>} - Buffer con el contenido del archivo
   */
  static async getDocumentContent(filePath, saveFile = false) {
    try {
      console.log(`Obteniendo documento: ${filePath}`);

      // Procedimiento PL/SQL a ejecutar
      const plsqlBlock = `
      BEGIN
        pkg_archivos.sp_descargar_archivo(
          pi_ruta => :pi_ruta,
          po_resultado => :po_resultado
        );
      END;`;

      // Parámetros de entrada y salida
      const bindParams = {
        pi_ruta: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: filePath },
        po_resultado: { dir: oracledb.BIND_OUT, type: oracledb.BLOB }
      };

      // Ejecutar el procedimiento
      const result = await this.executePLSQL(plsqlBlock, bindParams);

      // Obtener el BLOB resultante
      const blobData = result.po_resultado;

      if (!blobData) {
        console.warn(`No se encontró contenido para el archivo: ${filePath}`);
        return null;
      }

      console.log(`Documento obtenido correctamente, tamaño: ${blobData.length} bytes`);

      // Si es necesario guardar el archivo
      if (saveFile && blobData) {
        // Crear directorio si no existe
        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
          console.log(`Directorio creado: ${directory}`);
        }

        // Guardar el archivo
        fs.writeFileSync(filePath, blobData);
        console.log(`Archivo guardado correctamente en: ${filePath}`);
      }

      return blobData;
    } catch (error) {
      console.error('Error al obtener documento:', error.message, error.stack);
      throw new Error(`Error al obtener documento: ${error.message}`);
    }
  }

/**
 * Sube un documento a través del procedimiento PL/SQL
 * @param {Object} params - Parámetros de carga
 * @param {string} params.fileName - Nombre del archivo
 * @param {string} params.directory - Directorio donde se guardará
 * @param {Buffer|Uint8Array} params.content - Contenido del archivo en formato Buffer o Uint8Array
 * @param {string} [params.itemName=null] - Nombre del ítem (opcional)
 * @returns {Promise<Object>} - Resultado con la ruta y tipo MIME del archivo subido
 */
static async uploadDocument2(params) {
  try {
    console.log(`Subiendo documento: ${params.fileName}(${params.fileName.length}) al directorio: ${params.directory}`);
    
    // Verificación y conversión del contenido
    let contentBuffer;
    
    if (!params.content) {
      throw new Error('El contenido del documento no puede ser nulo');
    }
    
    // Verificar si es un Buffer o convertirlo a Buffer si es Uint8Array u otro formato compatible
    if (Buffer.isBuffer(params.content)) {
      contentBuffer = params.content;
    } else if (params.content instanceof Uint8Array) {
      contentBuffer = Buffer.from(params.content);
    } else if (typeof params.content === 'string') {
      contentBuffer = Buffer.from(params.content);
    } else {
      console.error('Tipo de contenido recibido:', typeof params.content);
      console.error('¿Es un array?', Array.isArray(params.content));
      console.error('Constructor:', params.content.constructor ? params.content.constructor.name : 'desconocido');
      throw new Error(`El contenido debe ser un Buffer, Uint8Array o string, recibido: ${typeof params.content}`);
    }
    
    console.log(`Contenido convertido a Buffer. Tamaño: ${contentBuffer.length} bytes`);
    
    // Procedimiento PL/SQL a ejecutar
    const plsqlBlock = `
    BEGIN
      pkg_archivos.sp_subir_archivo(
        pi_nombre_item => :pi_nombre_item,
        pi_directorio => :pi_directorio,
        pi_new_filename => :pi_new_filename,
        po_path_directorio => :po_path_directorio,
        po_mimetype => :po_mimetype,
        pio_blob_content => :pio_blob_content
      );
    END;`;
    
    // Parámetros de entrada y salida
    const bindParams = {
      pi_nombre_item: { 
        dir: oracledb.BIND_IN, 
        type: oracledb.STRING, 
        val: params.itemName || null 
      },
      pi_directorio: { 
        dir: oracledb.BIND_IN, 
        type: oracledb.STRING, 
        val: params.directory 
      },
      pi_new_filename: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.STRING, 
        val: params.fileName 
      },
      po_path_directorio: { 
        dir: oracledb.BIND_OUT, 
        type: oracledb.STRING 
      },
      po_mimetype: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.STRING,
        val: params.mimeType || null
      },
      pio_blob_content: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.BLOB, 
        val: contentBuffer 
      }
    };
    
    // Ejecutar el procedimiento
    const result = await this.executePLSQL(plsqlBlock, bindParams);
    
    console.log(`Documento subido correctamente a: ${result.po_path_directorio}`);
    
    return {
      path: result.po_path_directorio,
      filename: result.pi_new_filename,
      mimeType: result.po_mimetype,
      content: null//result.pio_blob_content // Podría ser útil si el procedimiento modifica el contenido
    };
  } catch (error) {
    console.error('Error al subir documento:', error.message, error.stack);
    throw new Error(`Error al subir documento: ${error.message}`);
  }
}

/**
 * Sube un documento a través del procedimiento PL/SQL
 * @param {Object} params - Parámetros de carga
 * @param {string} params.fileName - Nombre del archivo
 * @param {string} params.directory - Directorio donde se guardará
 * @param {Buffer|Uint8Array} params.content - Contenido del archivo en formato Buffer o Uint8Array
 * @param {string} [params.itemName=null] - Nombre del ítem (opcional)
 * @returns {Promise<Object>} - Resultado con la ruta y tipo MIME del archivo subido
 */
static async uploadDocument(params) {
  try {
    console.log(`Subiendo documento: ${params.fileName} al directorio: ${params.directory}`);
    
    // Verificación y conversión del contenido
    let contentBuffer;
    
    if (!params.content) {
      throw new Error('El contenido del documento no puede ser nulo');
    }
    
    // Verificar si es un Buffer o convertirlo a Buffer si es Uint8Array u otro formato compatible
    if (Buffer.isBuffer(params.content)) {
      contentBuffer = params.content;
    } else if (params.content instanceof Uint8Array) {
      contentBuffer = Buffer.from(params.content);
    } else if (typeof params.content === 'string') {
      contentBuffer = Buffer.from(params.content);
    } else {
      console.error('Tipo de contenido recibido:', typeof params.content);
      console.error('¿Es un array?', Array.isArray(params.content));
      console.error('Constructor:', params.content.constructor ? params.content.constructor.name : 'desconocido');
      throw new Error(`El contenido debe ser un Buffer, Uint8Array o string, recibido: ${typeof params.content}`);
    }
    
    console.log(`Contenido convertido a Buffer. Tamaño: ${contentBuffer.length} bytes`);
    
    // Procedimiento PL/SQL a ejecutar
    const plsqlBlock = `
    BEGIN
      pkg_archivos.sp_subir_archivo(
        pi_nombre_item => :pi_nombre_item,
        pi_directorio => :pi_directorio,
        pi_new_filename => :pi_new_filename,
        po_path_directorio => :po_path_directorio,
        po_mimetype => :po_mimetype,
        pio_blob_content => :pio_blob_content
      );
    END;`;
    
    // Parámetros de entrada y salida
    const bindParams = {
      pi_nombre_item: { 
        dir: oracledb.BIND_IN, 
        type: oracledb.STRING, 
        val: params.itemName || null 
      },
      pi_directorio: { 
        dir: oracledb.BIND_IN, 
        type: oracledb.STRING, 
        val: params.directory 
      },
      pi_new_filename: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.STRING, 
        val: params.fileName 
      },
      po_path_directorio: { 
        dir: oracledb.BIND_OUT, 
        type: oracledb.STRING 
      },
      po_mimetype: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.STRING,
        val: params.fileMimeType || null
      },
      pio_blob_content: { 
        dir: oracledb.BIND_INOUT, 
        type: oracledb.BLOB, 
        val: contentBuffer 
      }
    };
    
    // Ejecutar el procedimiento
    const result = await this.executePLSQL(plsqlBlock, bindParams);
    
    console.log(`Documento subido correctamente a: ${result.po_path_directorio}`);
    
    // Extraer el nombre del archivo de la ruta completa
    const fullPath = `${result.po_path_directorio}/${result.pi_new_filename}`;
    // Obtener solo la ruta del directorio (sin el nombre del archivo)
    const directoryPath = result.po_path_directorio;
    
    return {
      path: directoryPath,
      fullPath: fullPath,
      fileName: result.pi_new_filename,
      mimeType: result.po_mimetype,
      content: null//result.pio_blob_content // Podría ser útil si el procedimiento modifica el contenido
    };
  } catch (error) {
    console.error('Error al subir documento:', error.message, error.stack);
    throw new Error(`Error al subir documento: ${error.message}`);
  }
}

}

module.exports = DBService;