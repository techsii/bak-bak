import React, { useState, useEffect, useRef, useCallback } from 'react';
  import { Link, useNavigate } from 'react-router-dom';
  import { auth, db } from '../firebase/config';
  import { ref, get, set, onValue, update, serverTimestamp, onDisconnect } from 'firebase/database';
  import './Dashboard.css';
  import AccountIcon from './AccountIcon'; // adjust the path if it's in a different folder
  import TextChat from './TextChat';
  import backIcon from './back-icon.png';
  import chatIcon from './chat-icon.png';
  import videoIcon from './video-icon.png';
import settingsIcon from './settings-icon.png';
import signoutIcon from './signout-icon.png';
import liveIcon from './live-icon.png'; // Assuming you have a live icon for the live chat feature

function Dashboard() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
    const [connectionId, setConnectionId] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [activeTab, setActiveTab] = useState('video');
    const [pendingRequests, setPendingRequests] = useState([]);
    const [friendsData, setFriendsData] = useState({
      total: 0,
      online: 0,
      list: []
    });

    const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef();


    const requestCameraAndMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return stream;
      } catch (error) {
        console.error("Permission denied for camera/microphone", error);
        alert("Please allow access to your camera and microphone in your device/browser settings.");
        throw error;
      }
    };

    useEffect(() => {
      const fetchUserData = async () => {
        try {
          const user = auth.currentUser;
          if (!user) return;

          const userRef = ref(db, `users/${user.uid}`);
          const snapshot = await get(userRef);

          if (snapshot.exists()) {
            setUserData(snapshot.val());
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchUserData();
    }, []);

    useEffect(() => {
      const fetchFriendsAndRequests = async () => {
        if (!auth.currentUser) return;
        
        const friendsRef = ref(db, `friends/${auth.currentUser.uid}`);
        const requestsRef = ref(db, `friendRequests/${auth.currentUser.uid}`);
        
        onValue(friendsRef, (snapshot) => {
          // This onValue seems to be unused, the friends list is fetched in another useEffect.
          // Keeping it here in case it's for a different purpose, but the 'friends' variable is unused.
          snapshot.val();
        });

        onValue(requestsRef, (snapshot) => {
          const requests = snapshot.val() || {};
          const pending = Object.values(requests).filter(req => req.status === 'pending');
          setPendingRequests(pending);
        });
      };

      fetchFriendsAndRequests();
    }, []);

    useEffect(() => {
      if (!auth.currentUser) return;

      const friendsRef = ref(db, `friends/${auth.currentUser.uid}`);
      const unsubscribe = onValue(friendsRef, async (snapshot) => {
        const friends = snapshot.val() || {};
        const friendsList = [];
        let onlineCount = 0;

        // Fetch each friend's status
        for (const [friendId, friendData] of Object.entries(friends)) {
          const statusRef = ref(db, `status/${friendId}`);
          const statusSnap = await get(statusRef);
          const isOnline = statusSnap.exists() && statusSnap.val().online;
          
          friendsList.push({
            ...friendData,
            id: friendId,
            isOnline
          });

          if (isOnline) onlineCount++;
        }

        setFriendsData({
          total: friendsList.length,
          online: onlineCount,
          list: friendsList.sort((a, b) => b.addedAt - a.addedAt)
        });
      });

      return () => unsubscribe();
    }, []);

    const disconnectFromCall = useCallback(async () => {
      try {
        setSearching(false);
        setIsConnecting(false);

        // Clear availability listener
        if (window.availabilityListener) {
          window.availabilityListener();
          window.availabilityListener = null;
        }

        // Stop local video tracks
        if (localVideoRef.current?.srcObject) {
          const tracks = localVideoRef.current.srcObject.getTracks();
          tracks.forEach(track => {
            track.stop();
          });
          localVideoRef.current.srcObject = null;
        }

        // Stop remote video tracks
        if (remoteVideoRef.current?.srcObject) {
          const tracks = remoteVideoRef.current.srcObject.getTracks();
          tracks.forEach(track => {
            track.stop();
          });
          remoteVideoRef.current.srcObject = null;
        }

        // Clean up peer connection
        if (peerConnectionRef.current) {
          peerConnectionRef.current.ontrack = null;
          peerConnectionRef.current.onicecandidate = null;
          peerConnectionRef.current.oniceconnectionstatechange = null;
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        // Clean up Firebase entries
        if (auth.currentUser) {
          const updates = {};
          updates[`available/${auth.currentUser.uid}`] = null;
          if (connectionId) {
            updates[`connections/${connectionId}`] = null;
          }
          await update(ref(db), updates);
        }

        setConnectionId(null);

      } catch (err) {
        console.error("Error in disconnectFromCall:", err);
      }
    }, [connectionId]);

    const createPeerConnection = useCallback((disconnectCb) => {
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };
      const pc = new RTCPeerConnection(configuration);

      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          disconnectCb();
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate && connectionId) {
          try {
            await set(ref(db, `connections/${connectionId}/candidates/${auth.currentUser.uid}`), 
              event.candidate.toJSON()
            );
          } catch (err) {
            console.error("Error sending ICE candidate:", err);
          }
        }
      };

      pc.ontrack = (event) => {
        console.log('Received remote track');
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      return pc;
    }, [connectionId]);

    const findStranger = async () => {
      try {
        await disconnectFromCall();
        setSearching(true);

        // Get media stream first
        const stream = await requestCameraAndMic();
        if (!stream) throw new Error("Failed to get media stream");

        // Set up local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create peer connection
        const pc = createPeerConnection(disconnectFromCall);
        peerConnectionRef.current = pc;

        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        const myAvailabilityRef = ref(db, `available/${auth.currentUser.uid}`);
        const availableUsersRef = ref(db, 'available');

        // Set availability
        await set(myAvailabilityRef, {
          userId: auth.currentUser.uid,
          timestamp: Date.now(),
          seeking: true,
          matched: false
        });

        // Listen for matches
        const unsubscribe = onValue(availableUsersRef, async (snapshot) => {
          if (!searching) {
            unsubscribe();
            return;
          }

          const users = snapshot.val() || {};
          const availableUsers = Object.entries(users).filter(([uid, data]) => 
            uid !== auth.currentUser.uid && 
            data.seeking && 
            !data.matched
          );

          if (availableUsers.length > 0) {
            unsubscribe();
            const [partnerId] = availableUsers[Math.floor(Math.random() * availableUsers.length)];
            const newConnectionId = [auth.currentUser.uid, partnerId].sort().join('_');
            setConnectionId(newConnectionId);

            const updates = {};
            updates[`available/${auth.currentUser.uid}/matched`] = true;
            updates[`available/${auth.currentUser.uid}/connectionId`] = newConnectionId;
            updates[`available/${partnerId}/matched`] = true;
            updates[`available/${partnerId}/connectionId`] = newConnectionId;

            await update(ref(db), updates);
            await initiateConnection(partnerId, newConnectionId);
          }
        });

      } catch (err) {
        console.error("Error in findStranger:", err);
        await disconnectFromCall();
        alert("Failed to start video chat. Please check your camera/microphone permissions.");
      }
    };

    const initiateConnection = async (partnerId, connectionId) => {
      setIsConnecting(true);

      try {
        const pc = createPeerConnection(disconnectFromCall);
        peerConnectionRef.current = pc;

        const stream = await requestCameraAndMic();
        localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await set(ref(db, `connections/${connectionId}/offer`), {
          sdp: offer.sdp,
          type: offer.type
        });

        onValue(ref(db, `connections/${connectionId}/answer`), async (snapshot) => {
          const answer = snapshot.val();
          if (answer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        onValue(ref(db, `connections/${connectionId}/candidates/${partnerId}`), (snapshot) => {
          const candidate = snapshot.val();
          if (candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });

        setIsConnecting(false);
        setSearching(false);

      } catch (err) {
        console.error("Error establishing connection:", err);
        setIsConnecting(false);
        setSearching(false);
      }
    };

    useEffect(() => {
      return () => {
        disconnectFromCall();
      };
    }, []);

    useEffect(() => {
      const userStatusRef = ref(db, `status/${auth.currentUser?.uid}`);

      const connectedRef = ref(db, '.info/connected');
      const unsubscribe = onValue(connectedRef, (snap) => {
        if (snap.val() === true && auth.currentUser) {
          set(userStatusRef, {
            online: true,
            lastSeen: serverTimestamp()
          });

          onDisconnect(userStatusRef).set({
            online: false,
            lastSeen: serverTimestamp()
          });
        }
      });

      return () => {
        unsubscribe();
        if (auth.currentUser) {
          set(userStatusRef, {
            online: false,
            lastSeen: serverTimestamp()
          });
        }
      };
    }, []);

    const handleAcceptRequest = async (requestId, fromUser) => {
      try {
        const updates = {};
        
        // Remove all friend request entries
        updates[`friendRequests/${auth.currentUser.uid}/${requestId}`] = null;
        updates[`friendRequests/${fromUser.uid}/${auth.currentUser.uid}`] = null;
        
        // Add to both users' friends lists
        updates[`friends/${auth.currentUser.uid}/${fromUser.uid}`] = {
          uid: fromUser.uid,
          email: fromUser.email,
          addedAt: Date.now()
        };
        
        updates[`friends/${fromUser.uid}/${auth.currentUser.uid}`] = {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          addedAt: Date.now()
        };

        // Remove any notifications
        updates[`notifications/${auth.currentUser.uid}/${requestId}`] = null;
        updates[`notifications/${fromUser.uid}/${auth.currentUser.uid}`] = null;

        await update(ref(db), updates);
        
        // Update local state to remove the accepted request
        setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        
        alert('Friend request accepted! Added to your friends list.');
      } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('Failed to accept request. Please try again.');
      }
    };

    const handleDeclineRequest = async (requestId, fromUserId) => {
      try {
        // Remove request from all relevant locations
        const updates = {};
        // Remove from current user's requests
        updates[`friendRequests/${auth.currentUser.uid}/${requestId}`] = null;
        // Remove from sender's requests
        updates[`friendRequests/${fromUserId}/${auth.currentUser.uid}`] = null;
        // Remove from notifications if exists
        updates[`notifications/${auth.currentUser.uid}/${requestId}`] = null;
        updates[`notifications/${fromUserId}/${auth.currentUser.uid}`] = null;
        
        await update(ref(db), updates);
        
        // Update local state
        setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        
        alert('Friend request declined');
      } catch (error) {
        console.error('Error declining friend request:', error);
        alert('Failed to decline request. Please try again.');
      }
    };

    const handleRemoveFriend = async (friendId, friendEmail) => {
      try {
        const confirmed = window.confirm(`Are you sure you want to remove ${friendEmail} from your friends list?`);
        if (!confirmed) return;

        const updates = {};
        updates[`friends/${auth.currentUser.uid}/${friendId}`] = null;
        updates[`friends/${friendId}/${auth.currentUser.uid}`] = null;
        // Also remove any pending/accepted friend requests between these two users
        updates[`friendRequests/${auth.currentUser.uid}/${friendId}`] = null;
        updates[`friendRequests/${friendId}/${auth.currentUser.uid}`] = null;
        
        await update(ref(db), updates);
      } catch (error) {
        console.error('Error removing friend:', error);
        alert('Failed to remove friend. Please try again.');
      }
    };

    const handleSignOut = async () => {
      try {
        await auth.signOut();
        navigate('/');
      } catch (error) {
        console.error('Error signing out:', error);
      }
    };

    // Removed the initial loading check here as the user wants to remove the preloader.
    // The component will now render directly, and if userData is not available, it will show the error.

    return (
      <div className="dashboard-container">
        <aside className="dashboard-sidebar">
          <div className="sidebar-logo">
            <img src={liveIcon} alt="Settings" className="nav-icon" />
            <span>RandomChat</span>
          </div>
         {userData && (
  <div className="user-profile-section">
    <AccountIcon email={userData?.email || 'No email'} />
  </div>
)}


          <nav>
            <ul className="nav-menu">
              <li className="nav-item">
                <Link to="/" className="nav-link">
                  <img src={backIcon} alt="Back" className="nav-icon" />
                  <span>Back</span>
                </Link>
              </li>
              <li className="nav-item">
                <a href="/dashboard/video" className={`nav-link ${activeTab === 'video' ? 'active' : ''}`} 
                  onClick={(e) => { e.preventDefault(); setActiveTab('video'); }}>
                  <img src={videoIcon} alt="Video Chat" className="nav-icon" />
                  <span>Video Chat</span>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/text" className={`nav-link ${activeTab === 'text' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('text'); }}>
                  <img src={chatIcon} alt="Text Chat" className="nav-icon" />
                  <span>Text Chat</span>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/settings" className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('settings'); }}>
                  <img src={settingsIcon} alt="Settings" className="nav-icon" />
                  <span>Settings</span>
                </a>
              </li>
            </ul>
          </nav>
          <div className="sidebar-footer">
            <button onClick={handleSignOut} className="nav-link">
              <img src={signoutIcon} alt="Sign Out" className="nav-icon" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        <main className="main-content">
          {activeTab === 'settings' ? (
            <div className="settings-section">
              <div className="friends-management">
                {/* Friend Requests Section */}
                <div className="section-header">
                  <h2>Friend Requests</h2>
                  <span className="request-count">{pendingRequests.length} pending</span>
                </div>
                
                <div className="requests-list">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="request-item">
                      <div className="request-info">
                        <span className="requester-email">{request.fromEmail}</span>
                        <span className="request-time">
                          {new Date(request.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="request-actions">
                        <button className="accept-btn"
                          onClick={() => handleAcceptRequest(request.id, {
                            uid: request.from,
                            email: request.fromEmail
                          })}>
                          Accept
                        </button>
                        <button className="decline-btn"
                          onClick={() => handleDeclineRequest(request.id, request.from)}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingRequests.length === 0 && (
                    <p className="no-requests">No pending friend requests</p>
                  )}
                </div>

                {/* Friends List Section */}
                <div className="section-header">
                  <h2>Friends List</h2>
                  <div className="friends-stats">
                    <span className="total-friends">{friendsData.total} total</span>
                    <span className="online-friends">{friendsData.online} online</span>
                  </div>
                </div>
                
                <div className="friends-list">
                  {friendsData.list.map((friend) => (
                    <div key={friend.id} className="friend-item">
                      <div className="friend-info">
                        <div className="friend-primary">
                          <span className={`status-dot ${friend.isOnline ? 'online' : 'offline'}`} />
                          <span className="friend-email">{friend.email}</span>
                        </div>
                        <span className="friend-since">
                          Added {new Date(friend.addedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button className="remove-friend-btn"
                        onClick={() => handleRemoveFriend(friend.id, friend.email)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  {friendsData.total === 0 && (
                    <p className="no-friends">You haven't added any friends yet</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'video' ? (
            <div className="video-chat-section">
              <div className="video-container">
                <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
                <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
              </div>
              <div className="controls">
                {isConnecting ? (
                  <div className="connecting-status">
                    <div className="spinner"></div>
                    <p>Establishing connection...</p>
                  </div>
                ) : !searching ? (
                  <button className="find-stranger-btn" onClick={findStranger}>
                    Find Random Partner
                  </button>
                ) : (
                  <button className="cancel-search-btn" onClick={() => disconnectFromCall()}>
                    Cancel Search
                  </button>
                )}
              </div>
            </div>
          ) : activeTab === 'text' ? (
            <TextChat />
          ) : null}
        </main>
      </div>
    );
  }



  export default Dashboard;
