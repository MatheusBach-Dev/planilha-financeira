// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAACCDxdW9C605t24BIuXdUzAFI26uyhJk",
  authDomain: "planilha-financeira-3b0b7.firebaseapp.com",
  projectId: "planilha-financeira-3b0b7",
  storageBucket: "planilha-financeira-3b0b7.firebasestorage.app",
  messagingSenderId: "958001804930",
  appId: "1:958001804930:web:42a0aa903487ddcb4fa69b",
  measurementId: "G-WFZ6PHSDMQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
