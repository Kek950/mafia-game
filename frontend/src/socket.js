import { io } from 'socket.io-client';

const isLocalhost = window.location.hostname === 'localhost';

// Backend URL: localhost для разработки, env variable для продакшена
// Vercel: задай VITE_BACKEND_URL в настройках проекта (Settings → Environment Variables)
const DEV_URL = 'http://localhost:3001';
const URL = isLocalhost ? DEV_URL : (import.meta.env.VITE_BACKEND_URL || DEV_URL);

export const socket = io(URL, { autoConnect: false });
