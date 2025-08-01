import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config'; // Added db import
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, onValue, update } from 'firebase/database';
import NotificationPopup from './NotificationPopup';
import liveIcon from './live-icon.png';

function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [friendRequest, setFriendRequest] = useState(null);
  const [showPreloader, setShowPreloader] = useState(false); // State for preloader visibility
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('user');
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !auth.currentUser) return;

    const requestRef = ref(db, `friendRequests/${auth.currentUser.uid}`);
    const unsubscribe = onValue(requestRef, (snapshot) => {
      const requests = snapshot.val();
      if (requests) {
        const newRequests = Object.entries(requests)
          .filter(([_, request]) => request.status === 'pending')
          .map(([key, request]) => ({
            id: key,
            ...request
          }));
        
        if (newRequests.length > 0) {
          setFriendRequest(newRequests[0]);
        }
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      setShowPreloader(true); // Show preloader
      setTimeout(() => {
        navigate('/dashboard'); // Navigate after a short delay
      }, 1500); // 1.5 seconds delay
    } else {
      navigate('/login');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('user');
      setIsAuthenticated(false);
      navigate('/');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    
    if (snapshot.exists()) {
      const users = [];
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        if (userData.email?.toLowerCase().includes(searchQuery.toLowerCase())) {
          users.push({
            uid: childSnapshot.key,
            ...userData
          });
        }
      });
      setSearchResults(users);
      setShowResults(true);
    }
  };

  const handleUserSelect = (userId) => {
    navigate(`/friend-request/${userId}`);
    setShowResults(false);
    setSearchQuery('');
  };

  const handleAcceptRequest = async () => {
    if (!friendRequest) return;

    try {
      const updates = {};
      
      // Update request status
      updates[`friendRequests/${auth.currentUser.uid}/${friendRequest.id}/status`] = 'accepted';
      updates[`friendRequests/${friendRequest.from}/${auth.currentUser.uid}/status`] = 'accepted';
      
      // Add to friends list for both users
      updates[`friends/${auth.currentUser.uid}/${friendRequest.from}`] = {
        uid: friendRequest.from,
        email: friendRequest.fromEmail,
        addedAt: Date.now()
      };
      
      updates[`friends/${friendRequest.from}/${auth.currentUser.uid}`] = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        addedAt: Date.now()
      };

      await update(ref(db), updates);
      setFriendRequest(null);
      
      // Show success message
      alert('Friend request accepted! Added to your friends list.');
    } catch (error) {
      console.error('Error accepting friend request:', error);
      alert('Failed to accept friend request. Please try again.');
    }
  };

  const handleDeclineRequest = async () => {
    if (!friendRequest) return;

    const updates = {};
    // Remove the request from both users' friendRequests nodes
    updates[`friendRequests/${auth.currentUser.uid}/${friendRequest.id}`] = null;
    updates[`friendRequests/${friendRequest.from}/${auth.currentUser.uid}`] = null;

    await update(ref(db), updates);
    setFriendRequest(null);
    alert('Friend request declined.');
  };

  return (
    <div className="App">
      <nav className="navbar" aria-label="Main navigation" ref={navRef}>
        <div className="navbar-left">
        <div className="navbar-brand" aria-label="Homepage">
            <img src={liveIcon} alt="Live Icon" className="logo-icon-img" />
            <span className="logo-text">bakbak </span>
          </div>

          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search users by email..."
              aria-label="Search users"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" aria-label="Search">Search</button>
          </form>

          {showResults && searchResults.length > 0 && (
            <div className="search-results-popup">
              {searchResults.map((user) => (
                <div 
                  key={user.uid} 
                  className="search-result-item"
                  onClick={() => handleUserSelect(user.uid)}
                >
                  {user.email}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="navbar-right">
          <ul className={`navbar-links ${isMenuOpen ? 'active' : ''}`}>
            <li><a href="/#features" onClick={() => setIsMenuOpen(false)}>Features</a></li>
            <li><a href="/#trusted" onClick={() => setIsMenuOpen(false)}>Community</a></li>
            <li><a href="/#testimonials" onClick={() => setIsMenuOpen(false)}>Reviews</a></li>
            <li><a href="/#cta" onClick={() => setIsMenuOpen(false)}>Join BakBak</a></li>
          </ul>
          {!isAuthenticated ? (
            <Link to="/login" className="navbar-login" aria-label="Login">Login</Link>
          ) : (
            <button onClick={handleLogout} className="navbar-login" aria-label="Logout">Logout</button>
          )}
          <button 
            className="menu-toggle" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>
      </nav>

      <header className="hero">
        {showPreloader ? ( // Conditionally render preloader
          <div className="preloader">
            <div className="spinner"></div>
            <div className="preloader-text">Navigating to chat room...</div>
          </div>
        ) : (
          <div className="hero-content">
            <h1>Meet People Around the World, Instantly</h1>
            <p>Join real-time chats with strangers and make meaningful connections</p>
            <button className="btn-primary" onClick={handleGetStarted}>
              {isAuthenticated ? 'Go to Chat Room' : 'Start Chatting Free'}
            </button>
          </div>
        )}
      </header>

      <section className="trusted" id="trusted">
        <h2>Trusted By</h2>
        <div className="trusted-logos">
          <div className="trusted-logo">ChatSphere</div>
          <div className="trusted-logo">TalkNet</div>
          <div className="trusted-logo">MeetLoop</div>
          <div className="trusted-logo">AnonConnect</div>
        </div>
      </section>

      <section className="features" id="features">
        <h2>Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🌍</div>
            <h3>Global Chat</h3>
            <p>Connect with people from any country, any time.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Anonymous</h3>
            <p>Protect your identity while enjoying open conversations.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Fast & Real-time</h3>
            <p>Instant messaging powered by our fast backend system.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Interest Matching</h3>
            <p>Get paired with users who share your passions.</p>
          </div>
        </div>
      </section>

      <section className="testimonials" id="testimonials">
        <div className="testimonials-container">
          <h2>What Users Are Saying</h2>
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="testimonial-avatar">AR</div>
              <div className="testimonial-content">
                <div className="rating">★★★★★</div>
                <p>"I've met people from 10 different countries—love the random pairing!"</p>
                <div className="testimonial-author">
                  <strong>Anjali R.</strong>
                  <span>Verified User</span>
                </div>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-avatar">MK</div>
              <div className="testimonial-content">
                <div className="rating">★★★★★</div>
                <p>"The anonymity gives me confidence to be myself. Amazing app!"</p>
                <div className="testimonial-author">
                  <strong>Mike K.</strong>
                  <span>Verified User</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-container" id="cta">
        <h2 className="cta-title">Join BakBak Today</h2>
        <p className="cta-subtext">
          Become part of our growing community and start chatting with strangers around the globe!
        </p>
        <div className="cta-buttons">
          <Link to="/register" className="cta-btn">Create Account →</Link>
          <Link to="/login" className="cta-btn">Sign In</Link>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <img src={liveIcon} alt="Live Icon" className="logo-icon-img" />
            <span className="logo-text">bakbak</span>
          </div>
          <div className="footer-links">
            <a href="/#features">Features</a>
            <a href="/#trusted">Community</a>
            <a href="/privacy-policy">Privacy Policy</a>
          </div>
          <div className="footer-social">
            <a href="https://www.facebook.com" aria-label="Facebook">F</a>
            <a href="https://twitter.com" aria-label="Twitter">T</a>
            <a href="https://www.instagram.com" aria-label="Instagram">I</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {year} bakbak. All rights reserved.</p>
        </div>
      </footer>

      {friendRequest && (
        <NotificationPopup 
          notification={friendRequest}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
        />
      )}
    </div>
  );
}

export default Home;
