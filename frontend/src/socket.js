import { io } from 'socket.io-client';

// Vite uses 'import.meta.env' to access your variables
const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling']
});