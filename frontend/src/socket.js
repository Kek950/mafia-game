import { io } from 'socket.io-client';

// Live cloud backend tunnel for public hosting platforms without persistent WebSockets
const DEFAULT_CLOUD_BACKEND = 'https://jurisdiction-tasks-eastern-ordinance.trycloudflare.com';

// Automatically detect backend URL across local dev, LAN, Vercel, GitHub Pages, or cloud deployments
const getBackendUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL;
    }
    if (typeof window !== 'undefined') {
        // 1. Check if ?srv= parameter was passed in URL
        const urlParams = new URLSearchParams(window.location.search);
        const srv = urlParams.get('srv');
        if (srv) {
            const cleanSrv = srv.replace(/^https?:\/\//, '').replace(/\/$/, '');
            sessionStorage.setItem('mafia_backend_srv', cleanSrv);
            return `https://${cleanSrv}`;
        }

        // 2. Check if a server was saved in sessionStorage
        const savedSrv = sessionStorage.getItem('mafia_backend_srv');
        if (savedSrv) {
            return `https://${savedSrv.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
        }

        const host = window.location.hostname;
        // 3. If running on Vercel or GitHub Pages without ?srv=, use default active tunnel
        if (host.includes('vercel.app') || host.includes('github.io')) {
            return DEFAULT_CLOUD_BACKEND;
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
