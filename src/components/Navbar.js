import React from 'react';
import { Link } from 'react-router-dom';
import NavLogoutButton from './NavLogoutButton';
import './Navbar.css';

const Navbar = ({ isLoggedIn }) => {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-left">
          <div className="navbar-brand">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">Electricity</span>
            <span className="logo-sub">{`{ LIVE USAGE }`}</span>
          </div>
          
          <ul className="navbar-links">
            {/* Your navigation links */}
          </ul>
        </div>
        
        <div className="navbar-right">
          {isLoggedIn ? (
            <NavLogoutButton />
          ) : (
            <Link to="/login" className="navbar-login">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;