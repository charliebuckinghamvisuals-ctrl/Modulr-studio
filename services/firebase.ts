import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCDGYR0E90KlvY6DCW2QmqLt8xu0qaol8I",
  authDomain: "modulr-studio.firebaseapp.com",
  projectId: "modulr-studio",
  storageBucket: "modulr-studio.firebasestorage.app",
  messagingSenderId: "621045471494",
  appId: "1:621045471494:web:d30f5f438f9dd491a02687",
  measurementId: "G-5TYPNB8R87"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
