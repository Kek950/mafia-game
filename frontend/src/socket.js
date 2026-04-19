import { io } from 'socket.io-client';

// Vite uses 'import.meta.env' to access your Vercel variables
const URL = import.meta.env.VITE_BACKEND_URL;

export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'] // Helps with connection stability
});