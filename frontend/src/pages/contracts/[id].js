// src/pages/contract/[id].js
/*import React, { useEffect, useState, useContext } from 'react';
import { useRouter } from 'next/router';
import { getContractById, signContract } from '../../services/contractService';
import dynamic from 'next/dynamic';
import Layout from '../../components/Layout';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import Swal from 'sweetalert2';
import { UserContext, UserProvider } from '../../contexts/UserContext';

// Importar el visor PDF de forma dinámica para desactivar el SSR
const PDFViewer = dynamic(() => import('../../components/PDFViewer'), { ssr: false });

const ContractDetailsPage = () => {
  const [contract, setContract] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const router = useRouter();
  const { id } = router.query;
  var contract_path = null;


  // Obtener los datos del usuario y la IP desde el contexto
  const { user, userIp } = useContext(UserContext);
  //if(!user){
  //  router.push(`/login`);
  //}

  // Obtener los detalles del contrato
  useEffect(() => {
    if (id) {
      const fetchContract = async () => {
        try {
          const contractData = await getContractById(id);
          setContract(contractData);
          console.log('contractData: ', contractData);
          contract_path = contractData.FILE_PATH.replace('/home/oracle/documentos_158', 'http://archivos-locales.santaclara.com.py/');
          console.log('contract_path: ', contract_path);
        } catch (error) {
          console.error('Error fetching contract:', error);
        }
      };
      fetchContract();
    }
  }, [id]);
  
  const handleSignContract = async () => {
    if (!user) {
      Swal.fire({
        title: 'Error',
        text: 'No se pudo obtener la información del usuario. Intenta nuevamente.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
      return;
    }

    setIsSigning(true);
    try {
      const signatureData = {
        userId: user.userId,
        email: user.email,
        ip: userIp,
      };

      const response = await signContract(id, signatureData);
      Swal.fire({
        title: 'Información',
        text: 'Contrato firmado exitosamente.',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      setContract(response);
    } catch (error) {
      console.error('Error signing contract:', error);
      Swal.fire({
        title: 'Información',
        text: 'Error al firmar el contrato.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    } finally {
      setIsSigning(false);
    }
  };

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center flex flex-col items-center">
          <h2 className="text-2xl font-semibold mb-4">Cargando contrato...</h2>
          <AiOutlineLoading3Quarters className="animate-spin text-4xl text-blue-500 mt-4" />
        </div>
      </div>
    );
  }

  return (
    <Layout pageTitle={`Contrato: ${contract.title}`}>
      <div className="bg-white p-6 rounded-lg shadow-md">
        {contract.file_path && (
          <PDFViewer content={contract_path} />
        )}
        {!contract.signed && (
          <button
            onClick={handleSignContract}
            disabled={isSigning}
            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-200"
          >
            {isSigning ? 'Firmando...' : 'Firmar Contrato'}
          </button>
        )}
      </div>
    </Layout>
  );
};

export default ContractDetailsPage;
*/


// src/pages/contract/[id].js
import React, { useEffect, useState, useContext } from 'react';
import { useRouter } from 'next/router';
import { getContractById, signContract } from '../../services/contractService';
import dynamic from 'next/dynamic';
import Layout from '../../components/Layout';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import Swal from 'sweetalert2';
import { UserContext, UserProvider } from '../../contexts/UserContext';

// Importar el visor PDF de forma dinámica para desactivar el SSR
const PDFViewer = dynamic(() => import('../../components/PDFViewer'), { ssr: false });

const ContractDetailsPage = () => {
  const [contract, setContract] = useState(null);
  const [contractPdfUrl, setContractPdfUrl] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const router = useRouter();
  const { id } = router.query;

  // Obtener los datos del usuario y la IP desde el contexto
  const { user, userIp } = useContext(UserContext);

  // Función para construir la URL del PDF
  const buildPdfUrl = (filePath) => {
    if (!filePath) return null;
    
    // Reemplazar la ruta local por la URL del servidor web
    const pdfUrl = filePath.replace(
      '/home/oracle/documentos_158', 
      'http://archivos-locales.santaclara.com.py'
    );
    
    // Agregar timestamp para evitar cache si es necesario
    return `${pdfUrl}?t=${Date.now()}`;
  };

  // Función para verificar si la URL del PDF es accesible
  const verifyPdfUrl = async (url) => {
    try {
      setIsLoadingPdf(true);
      setPdfError(null);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'cors' // Importante para CORS
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('pdf')) {
        throw new Error('El archivo no es un PDF válido');
      }
      
      console.log('PDF URL verificada exitosamente:', url);
      return true;
    } catch (error) {
      console.error('Error verificando PDF URL:', error);
      setPdfError(`Error cargando PDF: ${error.message}`);
      return false;
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Obtener los detalles del contrato
  useEffect(() => {
    if (id) {
      const fetchContract = async () => {
        try {
          const contractData = await getContractById(id);
          setContract(contractData);
          console.log('contractData:', contractData);
          
          if (contractData.FILE_PATH) {
            const pdfUrl = buildPdfUrl(contractData.FILE_PATH);
            console.log('PDF URL construida:', pdfUrl);
            
            // Verificar que la URL sea accesible antes de establecerla
            const isAccessible = await verifyPdfUrl(pdfUrl);
            if (isAccessible) {
              setContractPdfUrl(pdfUrl);
            }
          }
        } catch (error) {
          console.error('Error fetching contract:', error);
          Swal.fire({
            title: 'Error',
            text: 'Error al cargar los datos del contrato',
            icon: 'error',
            confirmButtonText: 'Aceptar'
          });
        }
      };
      fetchContract();
    }
  }, [id]);
  
  const handleSignContract = async () => {
    if (!user) {
      Swal.fire({
        title: 'Error',
        text: 'No se pudo obtener la información del usuario. Intenta nuevamente.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
      return;
    }

    setIsSigning(true);
    try {
      const signatureData = {
        userId: user.userId,
        email: user.email,
        ip: userIp,
      };

      const response = await signContract(id, signatureData);
      Swal.fire({
        title: 'Información',
        text: 'Contrato firmado exitosamente.',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
      setContract(response);
    } catch (error) {
      console.error('Error signing contract:', error);
      Swal.fire({
        title: 'Información',
        text: 'Error al firmar el contrato.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    } finally {
      setIsSigning(false);
    }
  };

  // Función para recargar el PDF
  const handleReloadPdf = async () => {
    if (contract && contract.FILE_PATH) {
      const pdfUrl = buildPdfUrl(contract.FILE_PATH);
      const isAccessible = await verifyPdfUrl(pdfUrl);
      if (isAccessible) {
        setContractPdfUrl(pdfUrl);
      }
    }
  };

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center flex flex-col items-center">
          <h2 className="text-2xl font-semibold mb-4">Cargando contrato...</h2>
          <AiOutlineLoading3Quarters className="animate-spin text-4xl text-blue-500 mt-4" />
        </div>
      </div>
    );
  }

  return (
    <Layout pageTitle={`Contrato: ${contract.title}`}>
      <div className="bg-white p-6 rounded-lg shadow-md">
        {/* Mostrar estado de carga del PDF */}
        {isLoadingPdf && (
          <div className="text-center py-4">
            <AiOutlineLoading3Quarters className="animate-spin text-2xl text-blue-500 mx-auto mb-2" />
            <p>Verificando acceso al PDF...</p>
          </div>
        )}

        {/* Mostrar error del PDF si existe */}
        {pdfError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error al cargar el PDF:</p>
            <p>{pdfError}</p>
            <button 
              onClick={handleReloadPdf}
              className="mt-2 bg-red-600 text-white py-1 px-3 rounded text-sm hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Mostrar el PDF si la URL está disponible */}
        {contractPdfUrl && !isLoadingPdf && !pdfError && (
          <div className="mb-4">
            <PDFViewer content={contractPdfUrl} />
          </div>
        )}

        {/* Mostrar mensaje si no hay PDF disponible */}
        {!contractPdfUrl && !isLoadingPdf && !pdfError && (
          <div className="text-center py-8 text-gray-600">
            <p>No se pudo cargar el documento PDF</p>
            <button 
              onClick={handleReloadPdf}
              className="mt-2 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            >
              Intentar cargar nuevamente
            </button>
          </div>
        )}

        {/* Botón de firma */}
        {!contract.signed && contractPdfUrl && (
          <button
            onClick={handleSignContract}
            disabled={isSigning}
            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition duration-200 disabled:opacity-50"
          >
            {isSigning ? 'Firmando...' : 'Firmar Contrato'}
          </button>
        )}
      </div>
    </Layout>
  );
};

export default ContractDetailsPage;