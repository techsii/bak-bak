import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import './NavLogoutButton.css';

const NavLogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('user');
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <button className="nav-logout-btn" onClick={handleLogout}>
      <span className="logout-icon">🚪</span>
      Logout
    </button>
  );
};

export default NavLogoutButton;
