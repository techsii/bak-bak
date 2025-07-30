import React, { useEffect, useState } from 'react';
import './NotificationPopup.css';

function NotificationPopup({ notification, onAccept, onDecline, onTimeout }) {
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsHiding(true);
      // After the slide-out animation, call onTimeout to remove the component
      setTimeout(() => { // Removed hideTimer variable as it was unused
        if (onTimeout) {
          onTimeout();
        }
      }, 400); // Matches the slideOut animation duration
    }, 20000); // 20 seconds

    return () => {
      clearTimeout(timer);
    };
  }, [onTimeout]);

  return (
    <div className={`notification-popup ${isHiding ? 'slide-out' : ''}`}>
      <div className="notification-header">
        <div className="notification-icon">
          🔔
          <span className="notification-badge">1</span>
        </div>
        <h4>1 New Notification</h4>
      </div>
      <div className="notification-content">
        <div className="notification-message">
          <strong>{notification.fromEmail}</strong> wants to connect with you.
        </div>
      </div>
      <div className="notification-actions">
        <button className="accept-btn" onClick={onAccept}>Accept</button>
        <button className="decline-btn" onClick={onDecline}>Decline</button>
      </div>
    </div>
  );
}

export default NotificationPopup;
