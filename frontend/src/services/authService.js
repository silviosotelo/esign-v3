// authService.js (src/services/authService.js)
import axios from 'axios';
import { jwtDecode } from 'jwt-decode'; // Importación correcta


const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

export const login = async (ci, password) => {
  try {
    const response = await axios.post(`${backendUrl}/api/auth/login`, { ci: ci, password: password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  } catch (error) {
    // Si hay respuesta del servidor, utilizar el mensaje que viene en la respuesta
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error); // Mensaje enviado desde el backend
    } else {
      // Si no hay respuesta del servidor, usar un mensaje genérico
      throw new Error('Login failed: ' + error.message);
    }
  }
};


// Function to get user data from token
export const getUserId = async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const user = jwtDecode(token);
      return user.userId;
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }
  return null;
};

// Function to get user data from token
export const getUserDataFromToken = async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const user = jwtDecode(token);
      const AuthStr = 'Bearer '.concat(token); 
      const response = await axios.get(`${backendUrl}/api/users/data`, { headers: { Authorization: AuthStr }});
      return response.data;
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }
  return null;
};

export const logout = () => {
  localStorage.removeItem('token');
};
