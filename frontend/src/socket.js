import { io } from 'socket.io-client';

// Live cloud backend tunnel for public hosting platforms without persistent WebSockets
const CLOUD_BACKEND_URL = 'https://threatened-referrals-grey-pdf.trycloudflare.com';

// Automatically detect backend URL across local dev, LAN, Vercel, GitHub Pages, or cloud deployments
const getBackendUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        // If running on Vercel or GitHub Pages, route WebSockets to the live cloud backend
        if (host.includes('vercel.app') || host.includes('github.io')) {
            return CLOUD_BACKEND_URL;
        }
        if (window.location.port !== '5173' && window.location.origin && host !== 'localhost') {
            return window.location.origin;
        }
        if (host && host !== 'localhost') {
            return `${window.location.protocol}//${host}:3001`;
        }
    }
    return 'http://localhost:3001';
};

export const socket = io(getBackendUrl(), {
    autoConnect: false,
    transports: ['websocket', 'polling']
});
