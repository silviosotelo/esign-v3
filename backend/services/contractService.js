const ContractRepository = require('../repositories/contractRepository');
const UserRepository = require('../repositories/userRepository');
const { generateKeyPair, generateSignature } = require('../utils/signatureUtils');
const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLibDocument, rgb } = require('pdf-lib');
const DBService = require('../services/dbService');
const dateUtils = require('../utils/dateUtils');

class ContractService {

  async createContract(userId, { title, content, file_path, file_mimetype, file_name }) {
    const user = await UserRepository.findUserById(userId);
    if (!user) throw new Error('Usuario no encontrado');

    // Generar el par de claves RSA al crear el contrato
    // Validar que el correo electrónico existe antes de usarlo como passphrase
    const passPhrase = { id: user.ID, email: user.EMAIL, document: user.DOCUMENT } || 'default-passphrase'; // Usa un valor predeterminado si es necesario
    const { publicKey, keyId } = await generateKeyPair(passPhrase);

    // Crear el contrato con la clave pública y el ID de la clave
    return ContractRepository.create({
      userId,
      title,
      content,
      file_path,
      file_mimetype,
      file_name,
      status: 'PENDIENTE',
      publicKey,
      keyId
    });
  }

  async getUserContracts(userId) {
    return ContractRepository.findByUserId(userId);
  }

  async getContractById(contractId) {
    return ContractRepository.findById(contractId);
  }

  async signContract(contractId, userId, ip, passphrase) {
    try {
      const contract = await ContractRepository.findById(contractId);
      if (!contract) throw new Error('Contrato no encontrado');
      if (contract.STATUS === 'FIRMADO') throw new Error('El contrato ya está firmado');
      if (contract.STATUS === 'RECHAZADO') throw new Error('Un contrato con el mismo ID ha sido rechazado');

      const user = await UserRepository.findUserById(userId);

      // Generar el par de claves RSA al crear el contrato
      // Validar que el correo electrónico existe antes de usarlo como passphrase
      const passPhrase = { id: user.ID, email: user.EMAIL, document: user.DOCUMENT } || 'default-passphrase'; // Usa un valor predeterminado si es necesario

      // Obtener fecha actual en la zona horaria configurada
      const signedAtLocal = dateUtils.getCurrentDateInTimezone();

      // Formatear fecha para mostrar en logs
      console.log(`Contrato firmado el: ${dateUtils.formatDateForDisplay(signedAtLocal)}`);


      const dataToSign = {
        id: user.ID,
        email: user.EMAIL,
        document: user.DOCUMENT,
        name: user.NAME,
        type: 'CLIENTE',
        date: signedAtLocal,
        ip: ip || passphrase.ip
      };

      // Usar el `keyId` del contrato para generar la firma
      const { signature: digitalSignature } = await generateSignature(
        Buffer.from(dataToSign.toString()),
        contract.KEY_ID,
        passPhrase
      );

      console.log('Firma digital generada correctamente');

      // Crear objeto con los datos de la firma
      const additionalSignature = {
        userId: user.ID,
        name: user.NAME,
        email: user.EMAIL,
        document: user.DOCUMENT,
        type: 'CLIENTE',
        ip: ip || passphrase.ip,
        signedAt: signedAtLocal,
        keyId: contract.KEY_ID,  // Usar el mismo key_id del contrato
        signatureImage: null,
        digitalSignature: digitalSignature
      };

      console.log(`Objeto de firma adicional creado para ${additionalSignature.name}`);

      // Preparar el array de firmas adicionales
      let additionalSignatures = [];

      if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
        // Si ya hay firmas adicionales, clonamos el array para evitar mutar el original
        additionalSignatures = [...contract.additionalSignatures];
        console.log(`Se encontraron ${additionalSignatures.length} firmas adicionales existentes`);
      }

      // Añadir la nueva firma al array
      additionalSignatures.push(additionalSignature);
      console.log(`Añadida nueva firma. Total: ${additionalSignatures.length}`);

      // Actualizar contrato añadiendo la nueva firma
      console.log('Actualizando firmas adicionales en la base de datos...');

      // Actualizar el contrato con la firma
      const updatedContract = await ContractRepository.update(contractId, {
        status: 'FIRMADO',
        digitalSignature,
        signedAt: signedAtLocal,
        signedBy: {
          userId,
          email: user.EMAIL,
          document: user.DOCUMENT,
          name: user.NAME,
          ip: ip || passphrase.ip,
          type: 'CLIENTE',
          digitalSignature: digitalSignature
        },
        additionalSignatures: additionalSignatures
      });

      console.log('Firmas adicionales actualizadas correctamente');

      // Generar el PDF firmado
      const signedPdfResult = await this.generateSignedPDF(updatedContract);

      console.log('Resultado de generateSignedPDF:', JSON.stringify(signedPdfResult, null, 2));

      // Verificar que tenemos la información necesaria para actualizar el contrato
      if (!signedPdfResult || !signedPdfResult.fullPath) {
        throw new Error('No se pudo obtener la información del documento firmado');
      }

      // Actualizar el contrato con la información del documento firmado
      const updatedPath = await ContractRepository.updatePath(contractId, {
        file_path: signedPdfResult.fullPath,
        file_name: signedPdfResult.fileName,
        file_mimetype: signedPdfResult.mimeType
      });

      console.log('Contrato actualizado con nueva ruta:', updatedPath.file_path);

      return {
        success: true,
        contractId,
        status: 'FIRMADO',
        documentInfo: signedPdfResult,
        updatedContract: updatedPath
      };
    } catch (error) {
      console.error('Error en signContract:', error);
      throw new Error(`Error al firmar el contrato: ${error.message}`);
    }
  }

/**
 * Añade una firma adicional a un contrato existente
 * @param {string} contractId - ID del contrato a firmar
 * @param {object} signerData - Datos del firmante
 * @returns {Promise<object>} - Contrato actualizado con la nueva firma
 */
async addSignatureToContract(contractId, signerData) {
  try {
    console.log(`Añadiendo firma de tipo ${signerData.type} al contrato ${contractId}`);
    console.log('signerData: ', signerData);

    // Obtener el contrato
    const contract = await ContractRepository.findById(contractId);
    if (!contract) {
      throw new Error('Contrato no encontrado');
    }

    console.log(`Contrato encontrado. Estado: ${contract.STATUS}`);

    // Verificar que el contrato ya está firmado por el cliente
    if (contract.STATUS !== 'FIRMADO') {
      throw new Error('El contrato debe estar firmado por el cliente primero');
    }

    // Verificar que el tipo de firma no sea CLIENTE
    if (signerData.type?.toUpperCase() === 'CLIENTE') {
      throw new Error('No se puede añadir una firma de tipo CLIENTE. Use signContract para eso.');
    }

    // Verificar que el usuario firmante no sea el cliente
    if (signerData.userId === contract.USER_ID) {
      throw new Error('El cliente no puede añadir firmas adicionales al contrato. Use signContract para eso.');
    }

    // Preparar array de firmas adicionales existentes
    let existingSignatures = [];
    if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
      existingSignatures = [...contract.additionalSignatures];
    }

    // Verificar el orden de firmas: Jurídico antes que Legal
    /*const isLegalSignature = signerData.type?.toUpperCase() === 'LEGAL';
    const hasJuridicoSignature = existingSignatures.some(
      sig => sig.type && sig.type.toUpperCase() === 'JURIDICO'
    );

    // Si es firma de Legal, verificar que ya existe una firma de Jurídico
    if (isLegalSignature && !hasJuridicoSignature) {
      throw new Error('El departamento Jurídico debe firmar antes que el departamento Legal');
    }*/

    // Obtener información del usuario firmante
    const user = await UserRepository.findUserById(signerData.userId);
    if (!user) {
      throw new Error('Usuario firmante no encontrado');
    }

    console.log(`Usuario firmante encontrado: ${user.ID} - ${user.NAME}`);

    // Obtener información del usuario firmante original (cliente)
    const userClient = await UserRepository.findUserById(contract.USER_ID);
    if (!userClient) {
      throw new Error('Usuario firmante (Cliente) no encontrado');
    }

    // Obtener fecha y hora actual formateada correctamente
    let signedAtParaguay;
    try {
      signedAtParaguay = dateUtils.getCurrentDateInTimezone();
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      signedAtParaguay = new Date();
    }

    console.log(`Fecha de firma (Paraguay): ${signedAtParaguay.toISOString()}`);

    // Generar datos para firma
    const dataToSign = {
      id: user.ID,
      email: user.EMAIL,
      document: user.DOCUMENT,
      name: user.NAME,
      type: signerData.type,
      date: signedAtParaguay.toISOString(),
      ip: signerData.userIp
    };

    console.log(`Datos para firmar: ${JSON.stringify(dataToSign)}`);

    // Generar firma digital
    const { signature: digitalSignature } = await generateSignature(
      Buffer.from(JSON.stringify(dataToSign)),
      contract.KEY_ID,  // Usar el mismo keyId del contrato original
      { id: userClient.ID, email: userClient.EMAIL, document: userClient.DOCUMENT }
    );

    console.log('Firma digital generada correctamente');

    // Crear objeto con los datos de la firma
    const additionalSignature = {
      userId: user.ID,
      name: user.NAME,
      email: user.EMAIL,
      document: user.DOCUMENT,
      type: signerData.type,
      ip: signerData.userIp,
      signedAt: signedAtParaguay.toISOString(),
      keyId: contract.KEY_ID,  // Usar el mismo key_id del contrato
      signatureImage: signerData.signature,
      digitalSignature: digitalSignature
    };

    console.log(`Objeto de firma adicional creado para ${additionalSignature.name}`);

    // Preparar el array de firmas adicionales
    let additionalSignatures = [];

    if (existingSignatures.length > 0) {
      // Filtrar para asegurarnos de que no hay firmas del cliente
      additionalSignatures = existingSignatures.filter(sig => 
        sig.userId !== contract.USER_ID && sig.type?.toUpperCase() !== 'CLIENTE'
      );
      console.log(`Después de filtrar firmas del cliente, quedan ${additionalSignatures.length} firmas`);
      
      // IMPORTANTE: Verificar si el usuario de mismo tipo ya ha firmado, y reemplazar esa firma
      const sameTypeIndex = additionalSignatures.findIndex(
        sig => sig.type && sig.type.toUpperCase() === signerData.type.toUpperCase()
      );
      
      if (sameTypeIndex !== -1) {
        console.log(`Ya existe una firma del tipo ${signerData.type}. Reemplazando firma anterior.`);
        additionalSignatures[sameTypeIndex] = additionalSignature;
      } else {
        // Añadir la nueva firma al array
        additionalSignatures.push(additionalSignature);
      }
    } else {
      // No hay firmas adicionales, simplemente añadir la nueva
      additionalSignatures.push(additionalSignature);
    }
    
    console.log(`Total de firmas adicionales: ${additionalSignatures.length}`);

    // Actualizar contrato añadiendo la nueva firma
    console.log('Actualizando firmas adicionales en la base de datos...');
    const updatedContract = await ContractRepository.updateSignatures(contractId, {
      additionalSignatures: additionalSignatures
    });

    console.log('Firmas adicionales actualizadas correctamente');

    // Objeto para regenerar el PDF
    const contractForPdf = {
      ...updatedContract,
      id: contractId,
      USER_ID: contract.USER_ID, // Importante: añadir USER_ID para identificar correctamente al cliente
      signedBy: {
        userId: contract.USER_ID,
        name: userClient.NAME,
        document: userClient.DOCUMENT,
        email: userClient.EMAIL,
        type: 'CLIENTE',
        ip: contract.SIGNED_BY ? contract.SIGNED_BY.ip : '0.0.0.0'
      },
      signedAt: contract.SIGNED_AT,
      signature: contract.SIGNATURE,
      keyId: contract.KEY_ID,
      file_path: contract.FILE_PATH,
      file_name: contract.FILE_NAME,
      file_mimetype: contract.FILE_MIMETYPE,
      additionalSignatures: additionalSignatures
    };

    // Regenerar el PDF con SOLO la nueva firma
    console.log('Regenerando PDF con SOLO la nueva firma...');
    const signedPdfResult = await this.generateSignedPDF(contractForPdf, {
      onlyAdditionalSignatures: true,
      //onlyAddNewSignature: true,
      newSignatureType: signerData.type // Pasar el tipo de la nueva firma
    });

    console.log(`PDF regenerado correctamente: ${signedPdfResult.fullPath}`);

    // Actualizar la ruta del documento firmado
    console.log('Actualizando ruta del documento en la base de datos...');
    const updatedPath = await ContractRepository.updatePath(contractId, {
      file_path: signedPdfResult.fullPath,
      file_name: signedPdfResult.fileName,
      file_mimetype: signedPdfResult.mimeType
    });

    console.log('Ruta del documento actualizada correctamente');

    return {
      success: true,
      contractId,
      status: 'FIRMADO',
      signerType: signerData.type,
      documentInfo: signedPdfResult,
      updatedContract: updatedPath
    };
  } catch (error) {
    console.error('Error al añadir firma al contrato:', error);
    throw new Error(`Error al añadir firma al contrato: ${error.message}`);
  }
}

  // Función para construir rutas de almacenamiento
  async getDocumentPath(contractId, isSigned = false) {
    try {
      // Obtener la fecha actual
      const today = new Date();
      const year = format(today, 'yyyy'); // 2025
      const month = format(today, 'MM');  // 03
      const day = format(today, 'dd');    // 10

      // Construcción dinámica del directorio
      const basePath = path.join(
        `\\\\${process.env.FILE_SERVER_IP || 'localhost'}`,
        'Anamnesis',
        'Subidas',
        year,
        month,
        day,
        process.env.NODE_ENV || 'produccion', // Usa 'produccion' por defecto si no está definido
        process.env.DOCUMENT_DIRECTORY || 'GESTION_ONLINE'//, // Usa un directorio predeterminado si no está en .env
        //isSigned ? 'FIRMADOS' : 'PENDIENTES'
      );

      // Generar el nombre del archivo
      const fileName = `FDC_${contractId}${isSigned ? '_FIRMADO' : ''}.pdf`;

      // Crear el directorio si no existe
      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
        console.log(`Directorio creado: ${basePath}`);
      }

      // Retornar la ruta completa y el directorio
      return {
        fullPath: path.join(basePath, fileName),
        directory: basePath
      };
    } catch (error) {
      console.error('Error en getDocumentPath:', error);
      throw new Error(`Error construyendo ruta del documento: ${error.message}`);
    }
  }

  // Versión optimizada de generateInitialPDF
  async generateInitialPDF(contract) {
    try {
      const { fullPath, directory } = getDocumentPath(contract.id);

      // Crear directorio si no existe
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      // Validar y decodificar contenido
      const [, pdfBase64] = contract.content.split(',');
      if (!pdfBase64) throw new Error('Formato base64 inválido');

      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      fs.writeFileSync(fullPath, pdfBuffer);

      console.log(`PDF inicial generado en: ${fullPath}`);
      return fullPath;
    } catch (error) {
      console.error('Error en generateInitialPDF:', error);
      throw new Error(`Error al generar PDF inicial: ${error.message}`);
    }
  };

  // Función para añadir firma al PDF
  async addSignatureToPdf(pdfDoc, signature, yPosition, styleConfig) {
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    // Función helper para añadir texto
    const addText = (text, offset = 0) => {
      lastPage.drawText(text, {
        x: 10,
        y: yPosition - offset,
        ...styleConfig
      });
    };

    // Truncar el keyId a 20 caracteres
    const truncatedKeyId = signature.keyId && signature.keyId.length > 20
      ? signature.keyId.substring(0, 20)
      : signature.keyId || "";

    // Formatear la fecha en la zona horaria de Paraguay
    const dateFormatted = new Date(signature.signedAt)
      .toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

    // Añadir los datos de firma
    addText(`Firma en conformidad`);
    addText(`(${signature.document}) ${signature.name}`, styleConfig.margin);
    addText(`${dateFormatted}`, styleConfig.margin * 2);
    addText(`${signature.ip}`, styleConfig.margin * 3);
    addText(`Certificado número de serie:`, styleConfig.margin * 4);
    addText(`${truncatedKeyId}`, styleConfig.margin * 5);

    // Insertar imagen de firma si existe
    if (signature.signatureImage?.startsWith('data:image')) {
      try {
        const [, imageData] = signature.signatureImage.split(',');
        const image = await pdfDoc.embedPng(Buffer.from(imageData, 'base64'));

        lastPage.drawImage(image, {
          x: 50,
          y: yPosition - 120,
          width: 150,
          height: 60,
        });
      } catch (error) {
        console.error('Error insertando imagen de firma:', error);
      }
    }

    return yPosition - 180; // Devolver la nueva posición Y para la siguiente firma
  }

  // Versión modificada de generateSignedPDF para soportar múltiples firmas
  async generateSignedPDF2(contract, options = { onlyAdditionalSignatures: false }) {
    try {
      console.log('generateSignedPDF opciones:', options);
      let pdfBytes;
  
      try {
        // Obtener el documento original
        console.log('Obteniendo documento desde PL/SQL...');
        console.log('contract.file_path: ', contract.file_path);
        pdfBytes = await DBService.getDocumentContent(contract.file_path, false);
  
        if (!pdfBytes || pdfBytes.length === 0) {
          throw new Error('Documento no encontrado en la base de datos');
        }
  
        console.log(`Documento obtenido correctamente desde PL/SQL, tamaño: ${pdfBytes.length} bytes`);
      } catch (plsqlError) {
        console.error(`No se pudo obtener el documento desde PL/SQL: ${plsqlError.message}`);
        throw new Error('No se pudo obtener el documento original para firmar');
      }
  
      try {
        // Cargar el PDF
        console.log('Cargando documento PDF...');
        const pdfDoc = await PDFLibDocument.load(pdfBytes);
        console.log('Documento PDF cargado correctamente');
  
        // Configuración de estilos
        const styleConfig = {
          font: await pdfDoc.embedFont('Helvetica-Bold'),
          size: 8,
          color: rgb(0, 0, 0),
          margin: 10
        };
  
        // Calcular posición inicial para la primera firma
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
  
        // Identificar el ID del usuario cliente
        const clientUserId = contract.USER_ID || (contract.signedBy ? contract.signedBy.userId : null);
        console.log('ID del usuario cliente:', clientUserId);
  
        // Posiciones fijas para cada tipo de firma - IMPORTANTE: Estos valores son constantes
        const FIRMA_POSITIONS = {
          'CLIENTE': 0,   // Izquierda
          'JURIDICO': 1,  // Centro
          'LEGAL': 2      // Derecha
        };
  
        // Dividir el ancho de la página en tres secciones iguales
        const signatureWidth = width / 3;
  
        // Inicializar array para recolectar todas las firmas a procesar
        const todasLasFirmas = [];
  
        console.log('Recolectando firmas para el PDF...');
  
        // 1. Recolectar firma del cliente (si existe y debe incluirse)
        if (!options.onlyAdditionalSignatures && contract.signedBy) {
          console.log('Añadiendo firma del cliente');
          todasLasFirmas.push({
            type: 'CLIENTE',
            name: contract.signedBy.name,
            document: contract.signedBy.document,
            userId: contract.signedBy.userId || clientUserId,
            ip: contract.signedBy.ip,
            signedAt: contract.signedAt,
            keyId: contract.keyId || contract.KEY_ID,
            signatureImage: contract.signature,
            digitalSignature: contract.signedBy.digitalSignature            ,
            position: FIRMA_POSITIONS['CLIENTE'] // Posición fija 0 (izquierda)
          });
        }
  
        // 2. Recolectar firmas adicionales (jurídico, legal, etc.)
        if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
          console.log(`Procesando ${contract.additionalSignatures.length} firmas adicionales`);
          
          // Para cada firma adicional
          contract.additionalSignatures.forEach(firma => {
            // Normalizar el tipo de firma (mayúsculas)
            const tipoFirma = (firma.type || '').toUpperCase();
            
            // Solo procesar si no es de tipo cliente y no pertenece al cliente
            if (tipoFirma !== 'CLIENTE' && firma.userId !== clientUserId) {
              // Asignar posición basada en el tipo de firma
              let posicion;
              
              if (tipoFirma === 'JURIDICO') {
                posicion = FIRMA_POSITIONS['JURIDICO']; // Posición 1 (centro)
                console.log(`Añadiendo firma jurídica de ${firma.name} en posición ${posicion}`);
              } else if (tipoFirma === 'LEGAL') {
                posicion = FIRMA_POSITIONS['LEGAL']; // Posición 2 (derecha)
                console.log(`Añadiendo firma legal de ${firma.name} en posición ${posicion}`);
              } else {
                // Para otros tipos (caso excepcional), posición por defecto es derecha
                posicion = FIRMA_POSITIONS['LEGAL'];
                console.log(`Añadiendo firma de otro tipo (${tipoFirma}) en posición ${posicion}`);
              }
              
              // Añadir a la lista final con posición asignada
              todasLasFirmas.push({
                ...firma,
                position: posicion 
              });
            }
          });
        }
  
        // 3. Garantizar que no hay firmas duplicadas por posición
        const firmasPorPosicion = {};
        
        // Agrupar firmas por posición
        todasLasFirmas.forEach(firma => {
          // Si ya existe una firma en esta posición, la reemplazamos
          firmasPorPosicion[firma.position] = firma;
        });
        
        // Convertir de vuelta a array
        const firmasUnicas = Object.values(firmasPorPosicion);
        
        // Ordenar por posición para mantener el orden lógico
        firmasUnicas.sort((a, b) => a.position - b.position);
  
        console.log(`Total de firmas únicas por posición a añadir al PDF: ${firmasUnicas.length}`);
        firmasUnicas.forEach((firma, idx) => {
          console.log(`Firma ${idx + 1}: ${firma.name} (${firma.type}), posición asignada: ${firma.position}`);
        });
  
        // Añadir todas las firmas al PDF
        if (firmasUnicas.length > 0) {
          // El espacio disponible para cada firma
          const availableWidth = signatureWidth - 10; // 10px de margen
  
          for (let i = 0; i < firmasUnicas.length; i++) {
            const signature = firmasUnicas[i];
            
            // Calcular posición X basada en la posición fija
            const xPosition = 10 + (signature.position * signatureWidth);
            const yPosition = 180; // Altura fija para todas las firmas
  
            console.log(`Colocando firma de ${signature.name} (${signature.type}) en posición X:${xPosition}, Y:${yPosition}`);
  
            // Función para añadir texto en la posición calculada
            const addTextAtPosition = (text, offset = 0) => {
              lastPage.drawText(text, {
                x: xPosition,
                y: yPosition - offset,
                ...styleConfig
              });
            };
  
            // Truncar el keyId a 20 caracteres
            const truncatedKeyId = signature.digitalSignature && signature.digitalSignature.length > 20
              ? signature.digitalSignature.substring(0, 20)
              : signature.digitalSignature || "";
  
            // Formatear la fecha en la zona horaria de Paraguay
            let dateFormatted;
            try {
              // Formatear la fecha para mostrar
              dateFormatted = dateUtils.formatDateForDisplay(
                signature.signedAt,
                'dd/MM/yyyy HH:mm:ss'
              );
            } catch (error) {
              console.warn(`Error al formatear fecha: ${error.message}`);
              dateFormatted = signature.signedAt || new Date().toISOString();
            }
  
            // Añadir los datos de firma
            addTextAtPosition(`Firma en conformidad`);
            addTextAtPosition(`(${signature.document}) ${signature.name}`, styleConfig.margin);
            addTextAtPosition(`${dateFormatted}`, styleConfig.margin * 2);
            addTextAtPosition(`${signature.ip}`, styleConfig.margin * 3);
            addTextAtPosition(`Certificado número de serie:`, styleConfig.margin * 4);
            addTextAtPosition(`${truncatedKeyId}`, styleConfig.margin * 5);
  
            // Insertar imagen de firma si existe
            if (signature.signatureImage?.startsWith('data:image')) {
              try {
                const [, imageData] = signature.signatureImage.split(',');
                const image = await pdfDoc.embedPng(Buffer.from(imageData, 'base64'));
  
                // Ajustar tamaño de la imagen para que quepa en el espacio disponible
                const signatureImageWidth = Math.min(availableWidth - 20, 120);
                const signatureImageHeight = Math.min(60, 40);
  
                lastPage.drawImage(image, {
                  x: xPosition + 10, // 10px de margen desde el inicio de la sección
                  y: yPosition - 100,
                  width: signatureImageWidth,
                  height: signatureImageHeight,
                });
              } catch (error) {
                console.error(`Error insertando imagen de firma para ${signature.name}:`, error);
              }
            }
          }
        } else {
          console.warn('No hay firmas para añadir al documento');
        }
  
        // Guardar el PDF firmado
        console.log('Generando bytes del PDF firmado...');
        const signedPdfBytes = await pdfDoc.save();
        console.log(`PDF firmado generado correctamente, tamaño: ${signedPdfBytes.length} bytes`);
  
        // Convertir explícitamente a Buffer
        const contentBuffer = Buffer.isBuffer(signedPdfBytes)
          ? signedPdfBytes
          : Buffer.from(signedPdfBytes);
  
        // Subir documento a través de PL/SQL
        try {
          console.log('Subiendo documento firmado a la base de datos...');
  
          const fileName = contract.file_name;
          const fileMimeType = contract.file_mimetype;
          const directory = process.env.DOCUMENT_DIRECTORY || 'GESTION_ONLINE';
  
          console.log(`Subiendo archivo: ${fileName} al directorio: ${directory}`);
  
          // Subir documento
          const uploadResult = await DBService.uploadDocument({
            fileName: fileName,
            directory: directory,
            content: contentBuffer,
            itemName: null,
            fileMimeType: fileMimeType
          });
  
          console.log(`Documento firmado subido correctamente a: ${uploadResult.path}`);
          return uploadResult;
        } catch (saveError) {
          console.error(`Error al guardar el documento en la base de datos:`, saveError);
          throw new Error(`No se pudo guardar el documento firmado: ${saveError.message}`);
        }
      } catch (processingError) {
        console.error('Error al procesar el PDF:', processingError);
        throw new Error(`Error al procesar el PDF: ${processingError.message}`);
      }
    } catch (error) {
      console.error('Error en generateSignedPDF:', error);
      throw new Error(`Error al generar PDF firmado: ${error.message}`);
    }
  }

  async generateSignedPDF_no(contract, options = { onlyAdditionalSignatures: false }) {
    try {
      console.log('generateSignedPDF opciones:', options);
      let pdfBytes;
  
      try {
        // Obtener el documento original
        console.log('Obteniendo documento desde PL/SQL...');
        pdfBytes = await DBService.getDocumentContent(contract.file_path, false);
  
        if (!pdfBytes || pdfBytes.length === 0) {
          throw new Error('Documento no encontrado en la base de datos');
        }
  
        console.log(`Documento obtenido correctamente desde PL/SQL, tamaño: ${pdfBytes.length} bytes`);
      } catch (plsqlError) {
        console.error(`No se pudo obtener el documento desde PL/SQL: ${plsqlError.message}`);
        throw new Error('No se pudo obtener el documento original para firmar');
      }
  
      try {
        // Cargar el PDF
        console.log('Cargando documento PDF...');
        const pdfDoc = await PDFLibDocument.load(pdfBytes);
        console.log('Documento PDF cargado correctamente');
  
        // Configuración de estilos
        const styleConfig = {
          font: await pdfDoc.embedFont('Helvetica-Bold'),
          size: 8,
          color: rgb(0, 0, 0),
          margin: 10
        };
  
        // Calcular posición inicial para la primera firma
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
  
        // Identificar el ID del usuario cliente
        const clientUserId = contract.USER_ID || (contract.signedBy ? contract.signedBy.userId : null);
        console.log('ID del usuario cliente:', clientUserId);
  
        // ENFOQUE SIMPLE: 3 tipos de firmas en posiciones fijas
        // Cliente -> izquierda, Jurídico -> centro, Legal -> derecha
        const FIRMA_POSITIONS = {
          'CLIENTE': 0,
          'JURIDICO': 1,
          'LEGAL': 2
        };
  
        // Dividir el ancho de la página en tres secciones iguales
        const signatureWidth = width / 3;
  
        // Preparar las firmas a añadir
        const firmasParaAñadir = [];
  
        // 1. Añadir firma del cliente (si corresponde)
        if (!options.onlyAdditionalSignatures && contract.signedBy) {
          firmasParaAñadir.push({
            type: 'CLIENTE',
            name: contract.signedBy.name,
            document: contract.signedBy.document,
            userId: clientUserId,
            ip: contract.signedBy.ip,
            signedAt: contract.signedAt,
            keyId: contract.keyId || contract.KEY_ID,
            signatureImage: contract.signature,
            digitalSignature: contract.signature,
            position: FIRMA_POSITIONS['CLIENTE']
          });
        }
  
        // 2. Añadir firmas adicionales (si existen)
        if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
          // Buscar firmas de Jurídico y Legal
          let firmaJuridico = null;
          let firmaLegal = null;
  
          // Encontrar la última firma de cada tipo
          for (const firma of contract.additionalSignatures) {
            const tipoFirma = (firma.type || '').toUpperCase();
            
            if (tipoFirma === 'JURIDICO' && firma.userId !== clientUserId) {
              firmaJuridico = { ...firma, position: FIRMA_POSITIONS['JURIDICO'] };
            } else if (tipoFirma === 'LEGAL' && firma.userId !== clientUserId) {
              firmaLegal = { ...firma, position: FIRMA_POSITIONS['LEGAL'] };
            }
          }
  
          // Añadir firma Jurídica si existe
          if (firmaJuridico) {
            firmasParaAñadir.push(firmaJuridico);
          }
  
          // Añadir firma Legal si existe
          if (firmaLegal) {
            firmasParaAñadir.push(firmaLegal);
          }
        }
  
        console.log(`Total de firmas a añadir al PDF: ${firmasParaAñadir.length}`);
        firmasParaAñadir.forEach((firma, idx) => {
          console.log(`Firma ${idx + 1}: ${firma.name} (${firma.type}), posición: ${firma.position}`);
        });
  
        // Añadir las firmas al PDF
        if (firmasParaAñadir.length > 0) {
          // El espacio disponible para cada firma
          const availableWidth = signatureWidth - 10;
  
          for (let i = 0; i < firmasParaAñadir.length; i++) {
            const signature = firmasParaAñadir[i];
            
            // Calcular posición X basada en el tipo de firma
            const xPosition = 10 + (signature.position * signatureWidth);
            const yPosition = 180; // Altura fija para todas las firmas
  
            console.log(`Colocando firma de ${signature.name} (${signature.type}) en posición X:${xPosition}, Y:${yPosition}`);
  
            // Función para añadir texto
            const addTextAtPosition = (text, offset = 0) => {
              lastPage.drawText(text, {
                x: xPosition,
                y: yPosition - offset,
                ...styleConfig
              });
            };
  
            // Truncar el keyId a 20 caracteres
            const truncatedKeyId = signature.digitalSignature && signature.digitalSignature.length > 20
              ? signature.digitalSignature.substring(0, 20)
              : signature.digitalSignature || "";
  
            // Formatear la fecha
            let dateFormatted;
            try {
              dateFormatted = dateUtils.formatDateForDisplay(
                signature.signedAt,
                'dd/MM/yyyy HH:mm:ss'
              );
            } catch (error) {
              console.warn(`Error al formatear fecha: ${error.message}`);
              dateFormatted = signature.signedAt || new Date().toISOString();
            }
  
            // Añadir los datos de firma
            addTextAtPosition(`Firma en conformidad`);
            addTextAtPosition(`(${signature.document}) ${signature.name}`, styleConfig.margin);
            addTextAtPosition(`${dateFormatted}`, styleConfig.margin * 2);
            addTextAtPosition(`${signature.ip}`, styleConfig.margin * 3);
            addTextAtPosition(`Certificado número de serie:`, styleConfig.margin * 4);
            addTextAtPosition(`${truncatedKeyId}`, styleConfig.margin * 5);
  
            // Insertar imagen de firma si existe
            if (signature.signatureImage?.startsWith('data:image')) {
              try {
                const [, imageData] = signature.signatureImage.split(',');
                const image = await pdfDoc.embedPng(Buffer.from(imageData, 'base64'));
  
                // Ajustar tamaño de la imagen
                const signatureImageWidth = Math.min(availableWidth - 20, 120);
                const signatureImageHeight = Math.min(60, 40);
  
                lastPage.drawImage(image, {
                  x: xPosition + 10,
                  y: yPosition - 100,
                  width: signatureImageWidth,
                  height: signatureImageHeight,
                });
              } catch (error) {
                console.error(`Error insertando imagen de firma para ${signature.name}:`, error);
              }
            }
          }
        } else {
          console.warn('No hay firmas para añadir al documento');
        }
  
        // Guardar el PDF firmado
        console.log('Generando bytes del PDF firmado...');
        const signedPdfBytes = await pdfDoc.save();
        console.log(`PDF firmado generado correctamente, tamaño: ${signedPdfBytes.length} bytes`);
  
        // Convertir explícitamente a Buffer
        const contentBuffer = Buffer.isBuffer(signedPdfBytes)
          ? signedPdfBytes
          : Buffer.from(signedPdfBytes);
  
        // Subir documento a través de PL/SQL
        try {
          console.log('Subiendo documento firmado a la base de datos...');
  
          const fileName = contract.file_name;
          const fileMimeType = contract.file_mimetype;
          const directory = process.env.DOCUMENT_DIRECTORY || 'GESTION_ONLINE';
  
          console.log(`Subiendo archivo: ${fileName} al directorio: ${directory}`);
  
          // Subir documento
          const uploadResult = await DBService.uploadDocument({
            fileName: fileName,
            directory: directory,
            content: contentBuffer,
            itemName: null,
            fileMimeType: fileMimeType
          });
  
          console.log(`Documento firmado subido correctamente a: ${uploadResult.path}`);
          return uploadResult;
        } catch (saveError) {
          console.error(`Error al guardar el documento en la base de datos:`, saveError);
          throw new Error(`No se pudo guardar el documento firmado: ${saveError.message}`);
        }
      } catch (processingError) {
        console.error('Error al procesar el PDF:', processingError);
        throw new Error(`Error al procesar el PDF: ${processingError.message}`);
      }
    } catch (error) {
      console.error('Error en generateSignedPDF:', error);
      throw new Error(`Error al generar PDF firmado: ${error.message}`);
    }
  }

  async generateSignedPDF(contract, options = { onlyAdditionalSignatures: false }) {
    try {
      console.log('generateSignedPDF opciones:', options);
      let pdfBytes;
  
      try {
        // Obtener el documento original
        console.log('Obteniendo documento desde PL/SQL...');
        pdfBytes = await DBService.getDocumentContent(contract.file_path, false);
  
        if (!pdfBytes || pdfBytes.length === 0) {
          throw new Error('Documento no encontrado en la base de datos');
        }
  
        console.log(`Documento obtenido correctamente desde PL/SQL, tamaño: ${pdfBytes.length} bytes`);
      } catch (plsqlError) {
        console.error(`No se pudo obtener el documento desde PL/SQL: ${plsqlError.message}`);
        throw new Error('No se pudo obtener el documento original para firmar');
      }
  
      try {
        // Cargar el PDF
        console.log('Cargando documento PDF...');
        const pdfDoc = await PDFLibDocument.load(pdfBytes);
        console.log('Documento PDF cargado correctamente');
  
        // Configuración de estilos
        const styleConfig = {
          font: await pdfDoc.embedFont('Helvetica-Bold'),
          size: 8,
          color: rgb(0, 0, 0),
          margin: 10
        };
  
        // Calcular posición inicial para la primera firma
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
  
        // Identificar el ID del usuario cliente
        const clientUserId = contract.USER_ID || (contract.signedBy ? contract.signedBy.userId : null);
        console.log('ID del usuario cliente:', clientUserId);
  
        // ENFOQUE SIMPLE: 3 tipos de firmas en posiciones fijas
        // Cliente -> izquierda, Jurídico -> centro, Legal -> derecha
        const FIRMA_POSITIONS = {
          'CLIENTE': 0,
          'JURIDICO': 1,
          'LEGAL': 2
        };
  
        // Dividir el ancho de la página en tres secciones iguales
        const signatureWidth = width / 3;
  
        // Preparar las firmas a añadir
        const firmasParaAñadir = [];
  
        // 1. Añadir firma del cliente (si corresponde)
        if (!options.onlyAdditionalSignatures && contract.signedBy) {
          firmasParaAñadir.push({
            type: 'CLIENTE',
            name: contract.signedBy.name,
            document: contract.signedBy.document,
            userId: clientUserId,
            ip: contract.signedBy.ip,
            signedAt: contract.signedAt,
            keyId: contract.keyId || contract.KEY_ID,
            signatureImage: contract.signature,
            digitalSignature: contract.signedBy.digitalSignature,
            position: FIRMA_POSITIONS['CLIENTE']
          });
        }
  
        // 2. Añadir firmas adicionales (si existen)
        if (contract.additionalSignatures && Array.isArray(contract.additionalSignatures)) {
          // Buscar firmas de Jurídico y Legal
          let firmaJuridico = null;
          let firmaLegal = null;
  
          // Encontrar la última firma de cada tipo
          for (const firma of contract.additionalSignatures) {
            const tipoFirma = (firma.type || '').toUpperCase();
            
            if (tipoFirma === 'JURIDICO' && firma.userId !== clientUserId) {
              firmaJuridico = { ...firma, position: FIRMA_POSITIONS['JURIDICO'] };
            } else if (tipoFirma === 'LEGAL' && firma.userId !== clientUserId) {
              firmaLegal = { ...firma, position: FIRMA_POSITIONS['LEGAL'] };
            }
          }
  
          // Añadir firma Jurídica si existe
          if (firmaJuridico) {
            firmasParaAñadir.push(firmaJuridico);
          }
  
          // Añadir firma Legal si existe
          if (firmaLegal) {
            firmasParaAñadir.push(firmaLegal);
          }
        }
  
        console.log(`Total de firmas a añadir al PDF: ${firmasParaAñadir.length}`);
        firmasParaAñadir.forEach((firma, idx) => {
          console.log(`Firma ${idx + 1}: ${firma.name} (${firma.type}), posición: ${firma.position}`);
        });
  
        // Añadir las firmas al PDF
        if (firmasParaAñadir.length > 0) {
          // El espacio disponible para cada firma
          const availableWidth = signatureWidth - 10;
  
          for (let i = 0; i < firmasParaAñadir.length; i++) {
            const signature = firmasParaAñadir[i];
            
            // Calcular posición X basada en el tipo de firma
            const xPosition = 10 + (signature.position * signatureWidth);
            const yPosition = 180; // Altura fija para todas las firmas
  
            console.log(`Colocando firma de ${signature.name} (${signature.type}) en posición X:${xPosition}, Y:${yPosition}`);
  
            // Función básica para añadir texto
            const addTextAtPosition = (text, offset = 0) => {
              lastPage.drawText(text, {
                x: xPosition,
                y: yPosition - offset,
                ...styleConfig
              });
            };
  
            // Función para añadir texto con posible salto de línea
            const addTextWithLineBreak = (text, offset = 0, maxLength = 30) => {
              // Verificar si el texto excede la longitud máxima
              if (text.length <= maxLength) {
                // Si es corto, añadirlo normalmente
                lastPage.drawText(text, {
                  x: xPosition,
                  y: yPosition - offset,
                  ...styleConfig
                });
                return 0; // No se añadieron líneas adicionales
              } else {
                // Buscar un espacio adecuado para dividir el texto
                let breakIndex = maxLength;
                while (breakIndex > 0 && text[breakIndex] !== ' ') {
                  breakIndex--;
                }
                
                // Si no se encontró un espacio, dividir en el límite exacto
                if (breakIndex === 0) {
                  breakIndex = maxLength;
                }
                
                // Dividir el texto en dos líneas
                const firstLine = text.substring(0, breakIndex);
                const secondLine = text.substring(breakIndex + 1); // +1 para omitir el espacio
                
                // Dibujar la primera línea
                lastPage.drawText(firstLine, {
                  x: xPosition,
                  y: yPosition - offset,
                  ...styleConfig
                });
                
                // Dibujar la segunda línea
                lastPage.drawText(secondLine, {
                  x: xPosition,
                  y: yPosition - (offset + styleConfig.margin),
                  ...styleConfig
                });
                
                return styleConfig.margin; // Se añadió una línea adicional
              }
            };
  
            // Truncar el keyId a 20 caracteres
            const truncatedKeyId = signature.digitalSignature && signature.digitalSignature.length > 20
              ? signature.digitalSignature.substring(0, 20)
              : signature.digitalSignature || "";
  
            // Formatear la fecha
            let dateFormatted;
            try {
              dateFormatted = dateUtils.formatDateForDisplay(
                signature.signedAt,
                'dd/MM/yyyy HH:mm:ss'
              );
            } catch (error) {
              console.warn(`Error al formatear fecha: ${error.message}`);
              dateFormatted = signature.signedAt || new Date().toISOString();
            }
  
            // Añadir los datos de firma con manejo de saltos de línea
            addTextAtPosition(`Firma en conformidad`);
  
            // Texto del documento y nombre que puede necesitar salto de línea
            const docAndName = `(${signature.document}) ${signature.name}`;
            const extraOffset = addTextWithLineBreak(docAndName, styleConfig.margin, 25);
  
            // Ajustar los offsets siguientes si se añadió una línea extra
            addTextAtPosition(`${dateFormatted}`, styleConfig.margin * 2 + extraOffset);
            addTextAtPosition(`${signature.ip}`, styleConfig.margin * 3 + extraOffset);
            addTextAtPosition(`Certificado número de serie:`, styleConfig.margin * 4 + extraOffset);
            addTextAtPosition(`${truncatedKeyId}`, styleConfig.margin * 5 + extraOffset);
  
            // Insertar imagen de firma si existe
            if (signature.signatureImage?.startsWith('data:image')) {
              try {
                const [, imageData] = signature.signatureImage.split(',');
                const image = await pdfDoc.embedPng(Buffer.from(imageData, 'base64'));
  
                // Ajustar tamaño de la imagen
                const signatureImageWidth = Math.min(availableWidth - 20, 120);
                const signatureImageHeight = Math.min(60, 40);
  
                // Ajustar posición Y si se añadió una línea extra
                const imageYPosition = yPosition - 100 - extraOffset;
  
                lastPage.drawImage(image, {
                  x: xPosition + 10,
                  y: imageYPosition,
                  width: signatureImageWidth,
                  height: signatureImageHeight,
                });
              } catch (error) {
                console.error(`Error insertando imagen de firma para ${signature.name}:`, error);
              }
            }
          }
        } else {
          console.warn('No hay firmas para añadir al documento');
        }
  
        // Guardar el PDF firmado
        console.log('Generando bytes del PDF firmado...');
        const signedPdfBytes = await pdfDoc.save();
        console.log(`PDF firmado generado correctamente, tamaño: ${signedPdfBytes.length} bytes`);
  
        // Convertir explícitamente a Buffer
        const contentBuffer = Buffer.isBuffer(signedPdfBytes)
          ? signedPdfBytes
          : Buffer.from(signedPdfBytes);
  
        // Subir documento a través de PL/SQL
        try {
          console.log('Subiendo documento firmado a la base de datos...');
  
          const fileName = contract.file_name;
          const fileMimeType = contract.file_mimetype;
          const directory = process.env.DOCUMENT_DIRECTORY || 'GESTION_ONLINE';
  
          console.log(`Subiendo archivo: ${fileName} al directorio: ${directory}`);
  
          // Subir documento
          const uploadResult = await DBService.uploadDocument({
            fileName: fileName,
            directory: directory,
            content: contentBuffer,
            itemName: null,
            fileMimeType: fileMimeType
          });
  
          console.log(`Documento firmado subido correctamente a: ${uploadResult.path}`);
          return uploadResult;
        } catch (saveError) {
          console.error(`Error al guardar el documento en la base de datos:`, saveError);
          throw new Error(`No se pudo guardar el documento firmado: ${saveError.message}`);
        }
      } catch (processingError) {
        console.error('Error al procesar el PDF:', processingError);
        throw new Error(`Error al procesar el PDF: ${processingError.message}`);
      }
    } catch (error) {
      console.error('Error en generateSignedPDF:', error);
      throw new Error(`Error al generar PDF firmado: ${error.message}`);
    }
  }

}



module.exports = new ContractService();