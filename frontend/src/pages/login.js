import Head from 'next/head';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { login } from '../services/authService';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import Swal from 'sweetalert2';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [ci, setCI] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ciError, setCIError] = useState('');
  const router = useRouter();

  // Validar formato de número de documento paraguayo
  const validateCI = (value) => {
    // Permitir solo números y guiones
    const regex = /^[0-9-]*$/;
    if (!regex.test(value)) {
      setCIError('Solo se permiten números y guiones (-)');
      return false;
    }
    
    // Verificar que no tenga espacios, puntos o separadores de miles
    if (value.includes(' ') || value.includes('.') || value.includes(',')) {
      setCIError('No se permiten espacios, puntos o comas');
      return false;
    }
    
    // Limpiar error si es válido
    setCIError('');
    return true;
  };

  // Manejar cambio en el campo CI con validación en tiempo real
  const handleCIChange = (e) => {
    const value = e.target.value;
    
    // Filtrar caracteres no válidos automáticamente
    const filteredValue = value.replace(/[^0-9-]/g, '');
    
    setCI(filteredValue);
    validateCI(filteredValue);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Validar CI antes de enviar
    if (!validateCI(ci)) {
      Swal.fire({
        icon: "error",
        title: "Error de validación",
        text: "Por favor corrige el formato del número de documento"
      });
      return;
    }
    
    // Validar que el CI no esté vacío
    if (!ci.trim()) {
      Swal.fire({
        icon: "error",
        title: "Campo requerido",
        text: "El número de documento es obligatorio"
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await login(ci, password);
      /*Swal.fire({
        icon: "warning",
        title: response
      });*/
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      Swal.fire({
        icon: "error",
        title: error.message
      });
    }
  };

  return (
    <>
      {/* 📌 Cambia dinámicamente el título de la página */}
      <Head>
        <title>Iniciar Sesión - e-Sign</title>
        <meta name="description" content="Accede a tu cuenta para firmar documentos" />
        <link rel="icon" href="/favicon.png" />
      </Head>

      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        {isLoading ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center flex flex-col items-center">
            <h2 className="text-2xl font-semibold mb-4">Hola, un gusto que estés aquí 😊</h2>
            <p className="text-gray-600 mb-4">Te estamos redirigiendo...</p>
            <AiOutlineLoading3Quarters className="animate-spin text-4xl text-blue-500 mt-4" />
          </div>
        ) : (
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Campo Email comentado correctamente */}
              {/*
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  className="mt-1 p-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              */}
              
              <div>
                <label htmlFor="ci" className="block text-sm font-medium text-gray-700">
                  Nro. Documento
                </label>
                <input
                  type="text"
                  id="nroDocumento"
                  className={`mt-1 p-2 w-full border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                    ciError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:ring-blue-500'
                  }`}
                  placeholder="Ej: 1234567 o 1234567-8"
                  value={ci}
                  onChange={handleCIChange}
                  required
                />
                {ciError && (
                  <p className="mt-1 text-sm text-red-600">{ciError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Solo números y guiones (-). Sin espacios, puntos o comas.
                </p>
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  className="mt-1 p-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={!!ciError || !ci.trim()}
                className={`w-full py-2 px-4 rounded-md transition duration-200 ${
                  ciError || !ci.trim()
                    ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Login
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
};

export default LoginPage;