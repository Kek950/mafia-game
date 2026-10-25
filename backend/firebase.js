require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBksdpG0giAhiz0rLy66xVwQPUSIaxGoCg",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "mafia-fd9ed.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "mafia-fd9ed",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "mafia-fd9ed.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "988285381642",
    appId: process.env.FIREBASE_APP_ID || "1:988285381642:web:de09011fc044ba53bc83f3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db };
