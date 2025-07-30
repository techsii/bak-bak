import React, { useState } from 'react';
import './AccountIcon.css';

function AccountIcon({ email }) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <div 
      className="account-icon-wrapper"
      onMouseEnter={() => setShowPopup(true)}
      onMouseLeave={() => setShowPopup(false)}
    >
      <img 
        src="/account-icon.png" 
        alt="Account" 
        className="account-icon"
      />
      {showPopup && (
        <div className="email-popup">
          {email}
        </div>
      )}
    </div>
  );
}

export default AccountIcon;
