import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
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
  const [showPreloader, setShowPreloader] = useState(false);
  const [stats, setStats] = useState({
    users: 50000,
    messages: 2000000,
    countries: 195
  });
  
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const navRef = useRef(null);

  // ... (keep all your existing useEffect hooks and functions)
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

  // Animate stats counter
  useEffect(() => {
    const animateStats = () => {
      const duration = 2000;
      const steps = 60;
      const increment = duration / steps;
      let currentStep = 0;

      const timer = setInterval(() => {
        if (currentStep >= steps) {
          clearInterval(timer);
          return;
        }
        
        const progress = currentStep / steps;
        setStats({
          users: Math.floor(50000 * progress),
          messages: Math.floor(2000000 * progress),
          countries: Math.floor(195 * progress)
        });
        
        currentStep++;
      }, increment);
    };

    animateStats();
  }, []);

  // ... (keep all your existing handler functions)
  const handleGetStarted = () => {
    if (isAuthenticated) {
      setShowPreloader(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
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
      
      updates[`friendRequests/${auth.currentUser.uid}/${friendRequest.id}/status`] = 'accepted';
      updates[`friendRequests/${friendRequest.from}/${auth.currentUser.uid}/status`] = 'accepted';
      
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
      
      alert('Friend request accepted! Added to your friends list.');
    } catch (error) {
      console.error('Error accepting friend request:', error);
      alert('Failed to accept friend request. Please try again.');
    }
  };

  const handleDeclineRequest = async () => {
    if (!friendRequest) return;

    const updates = {};
    updates[`friendRequests/${auth.currentUser.uid}/${friendRequest.id}`] = null;
    updates[`friendRequests/${friendRequest.from}/${auth.currentUser.uid}`] = null;

    await update(ref(db), updates);
    setFriendRequest(null);
    alert('Friend request declined.');
  };

  return (
    <div className="App">
      {/* Your existing navbar */}
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
            <li><a href="/#how-it-works" onClick={() => setIsMenuOpen(false)}>How It Works</a></li>
            <li><a href="/#stats" onClick={() => setIsMenuOpen(false)}>Stats</a></li>
            <li><a href="/#testimonials" onClick={() => setIsMenuOpen(false)}>Reviews</a></li>
            <li><a href="/#pricing" onClick={() => setIsMenuOpen(false)}>Pricing</a></li>
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

      {/* Enhanced Hero Section */}
      <header className="hero">
        {showPreloader ? (
          <div className="preloader">
            <div className="spinner"></div>
            <div className="preloader-text">Navigating to chat room...</div>
          </div>
        ) : (
          <div className="hero-content">
            <div className="hero-badge">
              🌟 Trusted by 50,000+ users worldwide
            </div>
            <h1>Meet People Around the World, Instantly</h1>
            <p>Join real-time chats with strangers and make meaningful connections across {stats.countries}+ countries</p>
            <div className="hero-buttons">
              <button className="btn-primary" onClick={handleGetStarted}>
                {isAuthenticated ? 'Go to Chat Room' : 'Start Chatting Free'}
              </button>
              <Link to="/demo" className="btn-secondary">
                🎬 Watch Demo
              </Link>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-number">{stats.users.toLocaleString()}+</div>
                <div className="stat-label">Active Users</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{(stats.messages / 1000000).toFixed(1)}M+</div>
                <div className="stat-label">Messages Sent</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{stats.countries}+</div>
                <div className="stat-label">Countries</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Trust Indicators */}
      <section className="trust-section">
        <div className="container">
          <p className="trust-text">Trusted by leading communities worldwide</p>
          <div className="trust-logos">
            <div className="trust-logo">TechCrunch</div>
            <div className="trust-logo">Forbes</div>
            <div className="trust-logo">Wired</div>
            <div className="trust-logo">The Verge</div>
            <div className="trust-logo">Mashable</div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works" id="how-it-works">
        <div className="container">
          <h2>How BakBak Works</h2>
          <p className="section-subtitle">Get connected in just 3 simple steps</p>
          
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-icon">👤</div>
              <h3>Create Your Profile</h3>
              <p>Sign up with your email and set your interests to match with like-minded people</p>
            </div>
            
            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-icon">🎯</div>
              <h3>Get Matched</h3>
              <p>Our smart algorithm pairs you with compatible strangers based on your preferences</p>
            </div>
            
            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-icon">💬</div>
              <h3>Start Chatting</h3>
              <p>Begin meaningful conversations and build friendships that last a lifetime</p>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Features Section */}
      <section className="features" id="features">
        <div className="container">
          <h2>Powerful Features for Better Connections</h2>
          <p className="section-subtitle">Everything you need to make meaningful friendships</p>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3>Global Chat</h3>
              <p>Connect with people from any country, any time. Break down borders and make international friends.</p>
              <ul className="feature-list">
                <li>✓ Real-time translation</li>
                <li>✓ Cultural exchange</li>
                <li>✓ Time zone matching</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Privacy First</h3>
              <p>Your safety is our priority. Chat anonymously with advanced privacy controls.</p>
              <ul className="feature-list">
                <li>✓ End-to-end encryption</li>
                <li>✓ Anonymous profiles</li>
                <li>✓ Report & block system</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Lightning Fast</h3>
              <p>Instant messaging powered by our cutting-edge infrastructure.</p>
              <ul className="feature-list">
                <li>✓ Sub-second delivery</li>
                <li>✓ 99.9% uptime</li>
                <li>✓ Offline message sync</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Smart Matching</h3>
              <p>AI-powered matching system finds your perfect conversation partners.</p>
              <ul className="feature-list">
                <li>✓ Interest-based pairing</li>
                <li>✓ Personality matching</li>
                <li>✓ Language preferences</li>
              </ul>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🎮</div>
              <h3>Interactive Fun</h3>
              <p>Break the ice with games, polls, and interactive content.</p>
              <ul className="feature-list">
                <li>✓ Mini-games</li>
                <li>✓ Voice messages</li>
                <li>✓ Emoji reactions</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3>Cross-Platform</h3>
              <p>Chat seamlessly across all your devices with perfect sync.</p>
              <ul className="feature-list">
                <li>✓ Web, iOS, Android</li>
                <li>✓ Real-time sync</li>
                <li>✓ Cloud backup</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Section */}
      <section className="live-stats" id="stats">
        <div className="container">
          <h2>BakBak in Numbers</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">👥</div>
              <div className="stat-number">{stats.users.toLocaleString()}+</div>
              <div className="stat-label">Active Users</div>
              <div className="stat-growth">+12% this month</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">💬</div>
              <div className="stat-number">{(stats.messages / 1000000).toFixed(1)}M+</div>
              <div className="stat-label">Messages Exchanged</div>
              <div className="stat-growth">+25% this week</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">🌎</div>
              <div className="stat-number">{stats.countries}+</div>
              <div className="stat-label">Countries</div>
              <div className="stat-growth">Global reach</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-number">4.8</div>
              <div className="stat-label">User Rating</div>
              <div className="stat-growth">App Store & Play Store</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing" id="pricing">
        <div className="container">
          <h2>Choose Your Plan</h2>
          <p className="section-subtitle">Start free, upgrade when you're ready</p>
          
          <div className="pricing-toggle">
            <span>Monthly</span>
            <label className="toggle-switch">
              <input type="checkbox" />
              <span className="slider"></span>
            </label>
            <span>Yearly <span className="discount-badge">Save 20%</span></span>
          </div>
          
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="plan-header">
                <h3>Free</h3>
                <div className="price">
                  <span className="currency">$</span>
                  <span className="amount">0</span>
                  <span className="period">/month</span>
                </div>
              </div>
              <ul className="plan-features">
                <li>✓ 10 chats per day</li>
                <li>✓ Basic matching</li>
                <li>✓ Text messaging</li>
                <li>✓ Community support</li>
                <li>✗ Priority matching</li>
                <li>✗ Voice messages</li>
              </ul>
              <button className="plan-button secondary">Current Plan</button>
            </div>
            
            <div className="pricing-card featured">
              <div className="plan-badge">Most Popular</div>
              <div className="plan-header">
                <h3>Pro</h3>
                <div className="price">
                  <span className="currency">$</span>
                  <span className="amount">9</span>
                  <span className="period">/month</span>
                </div>
              </div>
              <ul className="plan-features">
                <li>✓ Unlimited chats</li>
                <li>✓ Smart AI matching</li>
                <li>✓ Voice & video calls</li>
                <li>✓ Priority support</li>
                <li>✓ Advanced filters</li>
                <li>✓ No ads</li>
              </ul>
              <button className="plan-button primary">Upgrade Now</button>
            </div>
            
            <div className="pricing-card">
              <div className="plan-header">
                <h3>Premium</h3>
                <div className="price">
                  <span className="currency">$</span>
                  <span className="amount">19</span>
                  <span className="period">/month</span>
                </div>
              </div>
              <ul className="plan-features">
                <li>✓ Everything in Pro</li>
                <li>✓ VIP matching queue</li>
                <li>✓ Custom themes</li>
                <li>✓ Analytics dashboard</li>
                <li>✓ Early feature access</li>
                <li>✓ 24/7 priority support</li>
              </ul>
              <button className="plan-button secondary">Choose Premium</button>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Testimonials */}
      <section className="testimonials" id="testimonials">
        <div className="testimonials-container">
          <h2>What Our Users Say</h2>
          <p className="section-subtitle">Real stories from our amazing community</p>
          
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="testimonial-header">
                <div className="testimonial-avatar">AR</div>
                <div className="testimonial-info">
                  <div className="testimonial-name">Anjali R.</div>
                  <div className="testimonial-title">Content Creator</div>
                  <div className="rating">★★★★★</div>
                </div>
              </div>
              <p>"I've met people from 10 different countries through BakBak. The cultural exchange has been incredible. Love how easy it is to connect with like-minded individuals!"</p>
              <div className="testimonial-meta">
                <span className="verified">✓ Verified User</span>
                <span className="date">2 weeks ago</span>
              </div>
            </div>
            
            <div className="testimonial-card">
              <div className="testimonial-header">
                <div className="testimonial-avatar">MK</div>
                <div className="testimonial-info">
                  <div className="testimonial-name">Mike K.</div>
                  <div className="testimonial-title">Software Engineer</div>
                  <div className="rating">★★★★★</div>
                </div>
              </div>
              <p>"The anonymity gives me confidence to be myself. I've had deep, meaningful conversations that I wouldn't have had otherwise. The matching algorithm is spot-on!"</p>
              <div className="testimonial-meta">
                <span className="verified">✓ Verified User</span>
                <span className="date">1 month ago</span>
              </div>
            </div>
            
            <div className="testimonial-card">
              <div className="testimonial-header">
                <div className="testimonial-avatar">SL</div>
                <div className="testimonial-info">
                  <div className="testimonial-name">Sarah L.</div>
                  <div className="testimonial-title">Student</div>
                  <div className="rating">★★★★★</div>
                </div>
              </div>
              <p>"As an introvert, BakBak helped me break out of my shell. I've made genuine friendships and even found my study buddy for university. Highly recommended!"</p>
              <div className="testimonial-meta">
                <span className="verified">✓ Verified User</span>
                <span className="date">3 weeks ago</span>
              </div>
            </div>
          </div>
          
          <div className="testimonial-stats">
            <div className="testimonial-stat">
              <div className="stat-number">98%</div>
              <div className="stat-label">User Satisfaction</div>
            </div>
            <div className="testimonial-stat">
              <div className="stat-number">4.8/5</div>
              <div className="stat-label">Average Rating</div>
            </div>
            <div className="testimonial-stat">
              <div className="stat-number">50K+</div>
              <div className="stat-label">Happy Users</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq">
        <div className="container">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>Is BakBak really free?</h3>
              <p>Yes! BakBak offers a generous free tier with 10 chats per day. You can upgrade to Pro or Premium for unlimited features.</p>
            </div>
            
            <div className="faq-item">
              <h3>How does the matching work?</h3>
              <p>Our AI algorithm considers your interests, preferences, personality, and activity patterns to find compatible conversation partners.</p>
            </div>
            
            <div className="faq-item">
              <h3>Is my privacy protected?</h3>
              <p>Absolutely. We use end-to-end encryption, don't store personal conversations, and you can chat completely anonymously.</p>
            </div>
            
            <div className="faq-item">
              <h3>Can I use BakBak on mobile?</h3>
              <p>Yes! BakBak works perfectly on mobile browsers, and we have native iOS and Android apps coming soon.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced CTA Section */}
      <section className="cta-container" id="cta">
        <div className="cta-content">
          <h2 className="cta-title">Ready to Make Your First Connection?</h2>
          <p className="cta-subtext">
            Join over 50,000 users who are already making meaningful friendships on BakBak. 
            Your next best friend is just one chat away.
          </p>
          <div className="cta-buttons">
            <Link to="/register" className="cta-btn primary">
              Start Chatting Free →
            </Link>
            <Link to="/login" className="cta-btn secondary">
              Sign In
            </Link>
          </div>
          <div className="cta-features">
            <div className="cta-feature">
              <span className="cta-feature-icon">⚡</span>
              <span>Instant setup</span>
            </div>
            <div className="cta-feature">
              <span className="cta-feature-icon">🔒</span>
              <span>100% secure</span>
            </div>
            <div className="cta-feature">
              <span className="cta-feature-icon">💸</span>
              <span>Free to start</span>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-main">
            <div className="footer-brand-section">
              <div className="footer-brand">
                <img src={liveIcon} alt="Live Icon" className="logo-icon-img" />
                <span className="logo-text">bakbak</span>
              </div>
              <p className="footer-description">
                Connecting hearts and minds across the globe. Make meaningful friendships 
                with people who share your interests and passions.
              </p>
              <div className="footer-social">
                <a href="https://www.facebook.com" aria-label="Facebook">📘</a>
                <a href="https://twitter.com" aria-label="Twitter">🐦</a>
                <a href="https://www.instagram.com" aria-label="Instagram">📷</a>
                <a href="https://www.linkedin.com" aria-label="LinkedIn">💼</a>
                <a href="https://discord.com" aria-label="Discord">🎮</a>
              </div>
            </div>
            
            <div className="footer-links-section">
              <div className="footer-column">
                <h4>Product</h4>
                <div className="footer-links">
                  <a href="/#features">Features</a>
                  <a href="/#pricing">Pricing</a>
                  <a href="/mobile">Mobile App</a>
                  <a href="/api">API</a>
                </div>
              </div>
              
              <div className="footer-column">
                <h4>Company</h4>
                <div className="footer-links">
                  <a href="/about">About Us</a>
                  <a href="/careers">Careers</a>
                  <a href="/press">Press</a>
                  <a href="/blog">Blog</a>
                </div>
              </div>
              
              <div className="footer-column">
                <h4>Support</h4>
                <div className="footer-links">
                  <a href="/help">Help Center</a>
                  <a href="/contact">Contact Us</a>
                  <a href="/community">Community</a>
                  <a href="/status">Status</a>
                </div>
              </div>
              
              <div className="footer-column">
                <h4>Legal</h4>
                <div className="footer-links">
                  <a href="/privacy">Privacy Policy</a>
                  <a href="/terms">Terms of Service</a>
                  <a href="/cookies">Cookie Policy</a>
                  <a href="/security">Security</a>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; {year} BakBak. All rights reserved.</p>
            <div className="footer-bottom-links">
              <a href="/sitemap">Sitemap</a>
              <span>•</span>
              <a href="/accessibility">Accessibility</a>
              <span>•</span>
              <a href="/trust">Trust & Safety</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Notification Popup */}
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
