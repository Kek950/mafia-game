import { io } from 'socket.io-client';

// Automatically detect backend URL across local dev, LAN, GitHub Pages, or cloud deployments
const getBackendUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof window !== 'undefined') {
        // If running on GitHub Pages, route WebSockets to the live cloud backend tunnel
        if (window.location.hostname.includes('github.io')) {
            return 'https://threatened-referrals-grey-pdf.trycloudflare.com';
        }
        if (window.location.port !== '5173' && window.location.origin) {
            return window.location.origin;
        }
        if (window.location.hostname && window.location.hostname !== 'localhost') {
            return `${window.location.protocol}//${window.location.hostname}:3001`;
        }
    }
    return 'http://localhost:3001';
};

export const socket = io(getBackendUrl(), {
    autoConnect: false,
    transports: ['websocket', 'polling']
});
