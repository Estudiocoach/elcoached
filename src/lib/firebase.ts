import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD-u705CCRJfqOIZcS-CVF0d-BlOUSDu6c",
  authDomain: "gen-lang-client-0987250248.firebaseapp.com",
  projectId: "gen-lang-client-0987250248",
  storageBucket: "gen-lang-client-0987250248.firebasestorage.app",
  messagingSenderId: "379061955055",
  appId: "1:379061955055:web:fb18d4d9a3b86c9f2b6e1a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-a01ab458-68a0-4168-8e3e-9e094a1c5116");
export const auth = getAuth(app);
