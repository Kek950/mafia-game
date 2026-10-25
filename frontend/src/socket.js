import { io } from 'socket.io-client';

// Automatically detect host IP if running across devices on LAN or online
const getBackendUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost') {
        return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    return 'http://localhost:3001';
};

export const socket = io(getBackendUrl(), {
    autoConnect: false,
    transports: ['websocket', 'polling']
});
