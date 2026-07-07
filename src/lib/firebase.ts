import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAMQc3jQOD8EC8dXsRsUfxASF2ZsmAkSvQ",
  authDomain: "coached-678b5.firebaseapp.com",
  projectId: "coached-678b5",
  storageBucket: "coached-678b5.firebasestorage.app",
  messagingSenderId: "275336838710",
  appId: "1:275336838710:web:55ba4d731719b0c6b2a297",
  measurementId: "G-LZVPBD5E8C"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
