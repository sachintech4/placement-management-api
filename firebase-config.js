import { initializeApp } from "firebase/app";
import { getFirestore } from "@firebase/firestore";
import { getAuth } from "firebase/auth";
import dotenv from "dotenv";
dotenv.config();

const {
  VITE_apiKey,
  VITE_authDomain,
  VITE_projectId,
  VITE_storageBucket,
  VITE_messagingSenderId,
  VITE_appId,
  VITE_measurementId,
} = process.env;

const firebaseConfig = {
  apiKey: VITE_apiKey,
  authDomain: VITE_authDomain,
  projectId: VITE_projectId,
  storageBucket: VITE_storageBucket,
  messagingSenderId: VITE_messagingSenderId,
  appId: VITE_appId,
  measurementId: VITE_measurementId,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore();
const auth = getAuth(app);

export { db, auth };
