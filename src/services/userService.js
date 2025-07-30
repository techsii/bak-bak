import { ref, set } from 'firebase/database';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase/config';

export const createUserAccount = async (userData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      userData.email,
      userData.password
    );

    await set(ref(db, 'users/' + userCredential.user.uid), {
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      createdAt: new Date().toISOString(),
    });

    return userCredential.user;
  } catch (error) {
    throw error;
  }
};
  
