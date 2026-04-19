import { io } from 'socket.io-client';

// Automatically use the live server URL in production, or localhost in development
const isProduction = window.location.hostname !== 'localhost';

// Replace this URL with your actual backend URL once you deploy (e.g. Render, Heroku)
const PROD_URL = 'https://your-backend-url.onrender.com'; 
const DEV_URL = 'http://localhost:3001';

const URL = isProduction ? PROD_URL : DEV_URL;

export const socket = io(URL, { autoConnect: false });
