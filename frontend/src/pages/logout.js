// src/pages/logout.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

const LogoutPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Borrar el token del almacenamiento local
    localStorage.removeItem('token');

    // Redirigir al usuario al login después de un breve retraso
    setTimeout(() => {
      router.push('/login');
    }, 2000);
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center flex flex-col items-center">
        <h2 className="text-2xl font-semibold mb-4">Es una pena que tengas que irte, nos vemos pronto 👋</h2>
        <p className="text-gray-600 mb-4">Gracias por usar <b>e-Sign</b>.</p>
        <p className="text-gray-600 mb-4">Te estamos redirigiendo...</p>
        <AiOutlineLoading3Quarters className="animate-spin text-4xl text-blue-500 mt-4" />
      </div>
    </div>
  );
};

export default LogoutPage;
