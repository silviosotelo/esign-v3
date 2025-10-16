import React, { createContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { getUserDataFromToken } from '../services/authService';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userIp, setUserIp] = useState('127.0.0.1');
  const [loading, setLoading] = useState(true); // 📌 Estado para evitar bucles infinitos
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await getUserDataFromToken();
        if (userData) {
          setUser(userData);
        } else {
          throw new Error('Token inválido o usuario no encontrado');
        }
      } catch (error) {
        console.error('🔴 Error obteniendo usuario:', error);
        localStorage.removeItem('token'); // 📌 Eliminar token si es inválido
        router.replace('/login'); // 📌 Redirigir a login (usar `replace` para evitar bucles)
      } finally {
        setLoading(false); // 📌 Marcar como cargado
      }
    };

    const fetchUserIp = async () => {
      try {
        const response = await axios.get('https://api64.ipify.org?format=json');
        setUserIp(response.data.ip);
      } catch (error) {
        console.error('🔴 Error obteniendo IP:', error);
      }
    };

    if (loading) {
      fetchUserData();
      fetchUserIp();
    }
  }, [loading, router]); // 📌 Evita que el efecto se ejecute indefinidamente

  if (loading) {
    return <p>Cargando...</p>; // 📌 Mostrar un mensaje mientras se obtiene la info
  }

  return (
    <UserContext.Provider value={{ user, userIp }}>
      {children}
    </UserContext.Provider>
  );
};
