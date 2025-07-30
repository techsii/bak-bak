import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/config';
import { ref, get, update } from 'firebase/database';
import './FriendRequest.css';

function FriendRequest() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [userDetails, setUserDetails] = useState(null);
  const [requestStatus, setRequestStatus] = useState('');
  const [error, setError] = useState('');
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (userId === currentUser.uid) {
      setError("You can't send a request to yourself.");
      return;
    }

    const loadUserDetails = async () => {
      try {
        const userRef = ref(db, `users/${userId}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserDetails(snapshot.val());
        }

        const requestRef = ref(db, `friendRequests/${userId}/${currentUser.uid}`);
        const requestSnapshot = await get(requestRef);
        if (requestSnapshot.exists()) {
          setRequestStatus(requestSnapshot.val().status);
        }
      } catch (err) {
        setError("Failed to load user data.");
      }
    };

    loadUserDetails();
  }, [userId, currentUser, navigate]);

  const sendFriendRequest = async () => {
    if (!currentUser || !userDetails) return;

    try {
      const updates = {
        [`friendRequests/${userId}/${currentUser.uid}`]: {
          status: 'pending',
          timestamp: Date.now(),
          from: currentUser.uid,
          fromEmail: currentUser.email,
          toEmail: userDetails.email
        }
      };

      await update(ref(db), updates);
      setRequestStatus('pending');
      navigate('/');
    } catch (err) {
      setError("Failed to send friend request.");
    }
  };

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!userDetails) {
    return <div className="loading">Loading...</div>;
  }

  const userInitial = userDetails.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="friend-request-page">
      <header className="header">
        <h1>Friend Request</h1>
        <div className="nav-icons">
          <span className="search-icon">🔍</span>
          <span className="menu-icon">☰</span>
        </div>
      </header>

      <div className="request-card">
        <div className="avatar-circle">{userInitial}</div>
        <h2 className="user-email">{userDetails.email}</h2>

        <div className="request-actions">
          {!requestStatus && (
            <button className="send-request-btn" onClick={sendFriendRequest}>
              Send Friend Request
            </button>
          )}
          {requestStatus === 'pending' && (
            <p className="pending-status">Friend Request Pending</p>
          )}
          {requestStatus === 'accepted' && (
            <p className="accepted-status">Already Friends</p>
          )}
          {requestStatus === 'declined' && (
            <p className="declined-status">Friend Request Declined</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default FriendRequest;
