import { io } from 'socket.io-client';

// Fallback cloud backend tunnel for public hosting platforms (e.g. GitHub Pages)
const DEFAULT_CLOUD_BACKEND = 'https://competitions-tells-dual-radio.trycloudflare.com';

export const normalizeBackendUrl = (raw) => {
    if (!raw) return '';
    let val = String(raw).trim();
    if (!val.startsWith('http://') && !val.startsWith('https://')) {
        if (val.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(val)) {
            val = `http://${val}`;
        } else {
            val = `https://${val}`;
        }
    }
    return val.replace(/\/$/, '');
};

// Automatically detect backend URL across local dev, LAN, Vercel, GitHub Pages, or cloud deployments
export const getBackendUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) {
        return normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL);
    }
    if (typeof window !== 'undefined') {
        // 1. Check if ?srv= parameter was passed in URL
        const urlParams = new URLSearchParams(window.location.search);
        const srv = urlParams.get('srv');
        if (srv) {
            const cleanSrv = normalizeBackendUrl(srv);
            try {
                sessionStorage.setItem('mafia_backend_srv', cleanSrv);
                localStorage.setItem('mafia_backend_srv', cleanSrv);
            } catch (_) {}
            return cleanSrv;
        }

        // 2. Check if a server was saved in sessionStorage or localStorage
        let savedSrv = null;
        try {
            savedSrv = sessionStorage.getItem('mafia_backend_srv') || localStorage.getItem('mafia_backend_srv');
        } catch (_) {}
        if (savedSrv) {
            return normalizeBackendUrl(savedSrv);
        }

        const host = window.location.hostname;
        // 3. If running on Vercel or GitHub Pages without ?srv=, use default active tunnel
        if (host.includes('vercel.app') || host.includes('github.io')) {
            return DEFAULT_CLOUD_BACKEND;
        }

        // 4. If accessed via local network IP (e.g. 192.168.x.x on mobile phone)
        if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            return `http://${host}:3001`;
        }

        // 5. If hosted on a custom port or reverse proxy
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

export const reconnectWithUrl = (newUrl) => {
    const clean = normalizeBackendUrl(newUrl);
    if (!clean) return;
    try {
        sessionStorage.setItem('mafia_backend_srv', clean);
        localStorage.setItem('mafia_backend_srv', clean);
    } catch (_) {}
    if (socket.connected) {
        socket.disconnect();
    }
    socket.io.uri = clean;
    socket.connect();
};
