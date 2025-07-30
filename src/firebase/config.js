import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAOHKfARpobVRd7QLY1BcQMyXjMg6eSDMI",
  authDomain: "profile-database-fa673.firebaseapp.com",
  databaseURL: "https://profile-database-fa673-default-rtdb.firebaseio.com",
  projectId: "profile-database-fa673",
  storageBucket: "profile-database-fa673.appspot.com",
  messagingSenderId: "349540949644",
  appId: "1:349540949644:web:7b99ddd5acac93588265a9",
  measurementId: "G-V34HW6CGGK"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Initialize database rules
// Go to Firebase Console -> Realtime Database -> Rules and set:
/*
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    },
    "available": {
      ".read": "auth != null", 
      ".write": "auth != null"
    },
    "connections": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "chats": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
*/
