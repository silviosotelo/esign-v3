// src/components/PDFViewer.js
/*import React from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const PDFViewer = ({ content }) => {
  // Crear la instancia del plugin defaultLayoutPlugin y definir el tema como "dark"
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => defaultTabs,
    toolbarPlugin: {
      theme: 'dark', // Definir el tema predeterminado como oscuro
    },
  });
  console.log('PDFViewer.fileUrl: ', content);

  return (
    <div style={{ height: '750px' }}>
      <Worker workerUrl={`https://unpkg.com/pdfjs-dist@2.13.216/build/pdf.worker.min.js`}>
        <Viewer
          fileUrl={content}
          plugins={[defaultLayoutPluginInstance]}
        />
      </Worker>
    </div>
  );
};

export default PDFViewer;
*/



// src/components/PDFViewer.js
import React, { useState } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const PDFViewer = ({ content }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Crear la instancia del plugin defaultLayoutPlugin
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: (defaultTabs) => defaultTabs,
    toolbarPlugin: {
      theme: 'dark',
    },
  });

  // Manejar eventos del visor
  const handleDocumentLoad = () => {
    console.log('PDF cargado exitosamente:', content);
    setIsLoading(false);
    setError(null);
  };

  const handleDocumentLoadError = (error) => {
    console.error('Error cargando PDF:', error);
    setIsLoading(false);
    setError('Error al cargar el documento PDF. Verifica que el archivo sea accesible.');
  };

  // Validar que content sea una URL válida
  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Si content no es una URL válida, mostrar error
  if (!content || !isValidUrl(content)) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded">
        <div className="text-center">
          <p className="text-red-600 font-semibold">URL del PDF no válida</p>
          <p className="text-gray-600 text-sm mt-2">
            No se pudo cargar el documento
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Indicador de carga */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Cargando PDF...</p>
          </div>
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error:</p>
          <p>{error}</p>
          <p className="text-sm mt-2">URL: {content}</p>
        </div>
      )}

      {/* Visor PDF */}
      <div style={{ height: '750px' }} className="border rounded">
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
          <Viewer
            fileUrl={content}
            plugins={[defaultLayoutPluginInstance]}
            onDocumentLoad={handleDocumentLoad}
            onDocumentLoadError={handleDocumentLoadError}
            httpHeaders={{
              // Agregar headers si es necesario para autenticación
              'Cache-Control': 'no-cache',
            }}
            withCredentials={false} // Cambiar a true si necesitas cookies de autenticación
          />
        </Worker>
      </div>

      {/* Información de debug en desarrollo */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600">
          <p><strong>PDF URL:</strong> {content}</p>
          <p><strong>Estado:</strong> {isLoading ? 'Cargando...' : error ? 'Error' : 'Cargado'}</p>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;