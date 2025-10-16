// src/hooks/useAuth.js
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode'; // Importación correcta

const useAuth = () => {
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('token');

        if (!token) {
            // No token found, redirect to login page
            router.push('/login');
            return;
        }

        try {
            // Decode the token to check its validity
            const decodedToken = jwtDecode(token);
            const currentTime = Date.now() / 1000;

            if (decodedToken.exp < currentTime) {
                // Token is expired, redirect to login page
                localStorage.removeItem('token');
                router.push('/login');
            }
        } catch (error) {
            // Error decoding token, redirect to login
            console.error('Invalid token:', error);
            localStorage.removeItem('token');
            router.push('/login');
        }
    }, [router]);
};

export default useAuth;
