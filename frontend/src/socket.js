import { io } from 'socket.io-client';

const isLocalhost = window.location.hostname === 'localhost';

// Backend URL: localhost для разработки, реальный URL для продакшена
// Замени на свой URL если бэкенд на Render/Railway/etc
const PROD_URL = 'https://your-backend-url.onrender.com';
const DEV_URL = 'http://localhost:3001';

const URL = isLocalhost ? DEV_URL : PROD_URL;

export const socket = io(URL, { autoConnect: false });
