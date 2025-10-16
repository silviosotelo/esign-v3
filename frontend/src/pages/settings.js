// src/pages/settings.js
import React, { useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { UserContext } from '../contexts/UserContext';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

const SettingsPage = () => {
  const { user } = useContext(UserContext);
  const router = useRouter();

  // Redirigir si el usuario no es admin
  useEffect(() => {
    if (!user) {
      // Si no hay un usuario autenticado, redirigir al login
      router.push('/login');
    } else if (user.role !== 'admin') {
      // Si el usuario no es admin, redirigir al dashboard
      router.push('/dashboard');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center flex flex-col items-center">
          <h2 className="text-2xl font-semibold mb-4">Cargando configuración...</h2>
          <AiOutlineLoading3Quarters className="animate-spin text-4xl text-blue-500 mt-4" />
        </div>
      </div>
    );
  }

  return (
    <Layout pageTitle="Settings">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">Configuración</h2>
        <p>Bienvenido al área de configuración. Solo los usuarios administradores pueden acceder a esta página.</p>
      </div>
    </Layout>
  );
};

export default SettingsPage;
