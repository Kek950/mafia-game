const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBksdpG0giAhiz0rLy66xVwQPUSIaxGoCg",
    authDomain: "mafia-fd9ed.firebaseapp.com",
    projectId: "mafia-fd9ed",
    storageBucket: "mafia-fd9ed.firebasestorage.app",
    messagingSenderId: "988285381642",
    appId: "1:988285381642:web:de09011fc044ba53bc83f3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db };
