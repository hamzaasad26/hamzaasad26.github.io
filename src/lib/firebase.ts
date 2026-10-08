import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// These values are meant to be public. What protects your data is the
// Firestore security rules, not hiding this config.
const firebaseConfig = {
	apiKey: 'AIzaSyB0cJoD1nZe6vG0Yhbzs7VbL5rsEMYTA98',
	authDomain: 'portfolio-119e3.firebaseapp.com',
	projectId: 'portfolio-119e3',
	storageBucket: 'portfolio-119e3.firebasestorage.app',
	messagingSenderId: '719000562758',
	appId: '1:719000562758:web:097f394132c2d6364cee47',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);