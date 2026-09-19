import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 貼上你在 Firebase Console 複製的完整設定
const firebaseConfig = {
  apiKey: "AIzaSyAkuEjj0oIhIJGAYF4carwOnzpvtX8my8I",
  authDomain: "family-price-tracker.firebaseapp.com",
  databaseURL: "https://family-price-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "family-price-tracker",
  storageBucket: "family-price-tracker.firebasestorage.app",
  messagingSenderId: "926314767864",
  appId: "1:926314767864:web:27243ede7d86cce76ca20d"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 匯出 Firestore 資料庫實例
export const db = getFirestore(app);