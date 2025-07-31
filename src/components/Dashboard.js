import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ref, get, set, push, onValue, update,
  serverTimestamp, onDisconnect,
} from 'firebase/database';
import { auth, db } from '../firebase/config';
import './Dashboard.css';

// Icons and Sub-components
import AccountIcon   from './AccountIcon';
import TextChat      from './TextChat';
import videoIcon     from './video-icon.png';
import chatIcon      from './chat-icon.png';
import settingsIcon  from './settings-icon.png';
import signoutIcon   from './signout-icon.png';
import liveIcon      from './live-icon.png';

function Dashboard() {
  const navigate             = useNavigate();
  const [userData, setUserData]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [searching, setSearching]   = useState(false);
  const [connectionId, setConnectionId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeTab, setActiveTab]        = useState('video');
  const [pendingReqs, setPendingReqs]    = useState([]);
  const [friendsData, setFriendsData]    = useState({ total: 0, online: 0, list: [] });
  const [onlineCount, setOnlineCount]    = useState(0);

  const localVideoRef           = useRef(null);
  const remoteVideoRef          = useRef(null);
  const peerConnectionRef       = useRef(null);

  // ICE Server configuration
  const rtcConfig = useMemo(() => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  }), []);

  // Count users online (real-time)
  useEffect(() => {
    const statusRef = ref(db, 'status');
    return onValue(statusRef, snap => {
      const all = snap.val() || {};
      const count = Object.values(all).filter(u => u.online).length;
      setOnlineCount(count);
    });
  }, []);

  // --- HELPER: Get camera & mic with error handling
  const requestCameraAndMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => 
        t.addEventListener('ended', () => {
          alert(`${t.kind} track ended – reconnecting…`);
          disconnectFromCall();
        })
      );
      return stream;
    } catch (err) {
      let msg = 'Failed to access camera/mic. ';
      if (err.name === 'NotAllowedError') msg += 'Permission denied.';
      else if (err.name === 'NotFoundError') msg += 'No device found.';
      else msg += err.message;
      alert(msg);
      throw err;
    }
  };

  // --- HELPER: Create RTCPeerConnection instance
  const createPeerConnection = useCallback((disconnectCb) => {
    const pc = new RTCPeerConnection(rtcConfig);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setIsConnecting(false);
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        disconnectCb();
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') disconnectCb();
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onicecandidate = async (e) => {
      if (e.candidate && connectionId) {
        try {
          await push(
            ref(db, `connections/${connectionId}/candidates/${auth.currentUser.uid}`),
            e.candidate.toJSON(),
          );
        } catch (err) {
          console.error('Error sending ICE candidate:', err);
        }
      }
    };
    return pc;
  }, [connectionId, rtcConfig]);

  // --- Disconnect / Cleanup
  const disconnectFromCall = useCallback(async () => {
    try {
      setSearching(false);
      setIsConnecting(false);

      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      [localVideoRef, remoteVideoRef].forEach((vRef) => {
        if (vRef.current?.srcObject) {
          vRef.current.srcObject.getTracks().forEach((t) => t.stop());
          vRef.current.srcObject = null;
        }
      });

      if (auth.currentUser) {
        const updates = {
          [`available/${auth.currentUser.uid}`]: null,
        };
        if (connectionId) updates[`connections/${connectionId}`] = null;
        await update(ref(db), updates);
      }
      setConnectionId(null);
    } catch (err) { console.error('disconnectFromCall error:', err); }
  }, [connectionId]);

  // --- Fetch user profile on mount
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(db, `users/${auth.currentUser?.uid}`));
        if (snap.exists()) setUserData(snap.val());
      } finally { setLoading(false); }
    })();
  }, []);

  // --- Friend requests listener
  useEffect(() => {
    if (!auth.currentUser) return undefined;
    const reqRef = ref(db, `friendRequests/${auth.currentUser.uid}`);
    return onValue(reqRef, (snap) => {
      const all = snap.val() || {};
      const pending = Object.entries(all).filter(([, v]) => v.status === 'pending')
        .map(([id, v]) => ({ id, ...v }));
      setPendingReqs(pending);
    });
  }, []);

  // --- Friends list & online status
  useEffect(() => {
    if (!auth.currentUser) return undefined;
    const friendsRef = ref(db, `friends/${auth.currentUser.uid}`);
    return onValue(friendsRef, async (snap) => {
      const friends = snap.val() || {};
      const list = [];
      let online = 0;
      await Promise.all(Object.entries(friends).map(async ([fid, data]) => {
        const sSnap = await get(ref(db, `status/${fid}`));
        const isOnline = sSnap.exists() && sSnap.val().online;
        if (isOnline) online += 1;
        list.push({ ...data, id: fid, isOnline });
      }));
      list.sort((a, b) => b.addedAt - a.addedAt);
      setFriendsData({ total: list.length, online, list });
    });
  }, []);

  useEffect(() => () => { disconnectFromCall(); }, [disconnectFromCall]);

  // Mark presence in .info/connected
  useEffect(() => {
    if (!auth.currentUser) return undefined;
    const statusRef = ref(db, `status/${auth.currentUser.uid}`);
    const connRef   = ref(db, '.info/connected');

    const unsub = onValue(connRef, (snap) => {
      if (snap.val() === true) {
        set(statusRef, { online: true, lastSeen: serverTimestamp() });
        onDisconnect(statusRef).set({ online: false, lastSeen: serverTimestamp() });
      }
    });
    return () => { unsub(); set(statusRef, { online: false, lastSeen: serverTimestamp() }); };
  }, []);

  // --- CORE LOGIC: Find Stranger (only if 2+ available)
  const findStranger = async () => {
    await disconnectFromCall();
    setSearching(true);

    const stream = await requestCameraAndMic();
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    // Mark yourself as available
    const myAvailRef = ref(db, `available/${auth.currentUser.uid}`);
    await set(myAvailRef, { uid: auth.currentUser.uid, ts: Date.now(), matched: false });

    // Wait for at least TWO available people before matching
    const availRef = ref(db, 'available');
    const stop = onValue(availRef, async (snap) => {
      const all = snap.val() || {};
      const candidateEntries = Object.entries(all).filter(([uid, data]) => (
        !data.matched
      ));
      if (candidateEntries.length < 2) return; // Need at least two available!

      const myEntry = candidateEntries.find(([uid]) => uid === auth.currentUser.uid);
      const others   = candidateEntries.filter(([uid]) => uid !== auth.currentUser.uid);

      if (!others.length) return; // No one else to match with yet

      stop();

      const [partnerId] = others[Math.floor(Math.random() * others.length)];
      const cid = [auth.currentUser.uid, partnerId].sort().join('_');
      setConnectionId(cid);

      await update(ref(db), {
        [`available/${auth.currentUser.uid}/matched`]: true,
        [`available/${auth.currentUser.uid}/connectionId`]: cid,
        [`available/${partnerId}/matched`]            : true,
        [`available/${partnerId}/connectionId`]       : cid,
        [`connections/${cid}/participants`]           : [auth.currentUser.uid, partnerId],
      });
      initiateConnection(partnerId, cid, stream);
    });
    window.availStop = stop;
  };

  // --- Initiate outgoing connection
  const initiateConnection = async (partnerId, cid, localStream) => {
    setIsConnecting(true);
    try {
      const pc = createPeerConnection(disconnectFromCall);
      peerConnectionRef.current = pc;
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await update(ref(db), {
        [`connections/${cid}/offer`]       : offer.toJSON(),
        [`connections/${cid}/participants`]: [auth.currentUser.uid, partnerId],
      });

      onValue(ref(db, `connections/${cid}/answer`), async (snap) => {
        const ans = snap.val();
        if (ans && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new window.RTCSessionDescription(ans));
        }
      });

      onValue(ref(db, `connections/${cid}/candidates/${partnerId}`), (snap) => {
        const candList = snap.val();
        if (candList) Object.values(candList).forEach((c) => (
          pc.addIceCandidate(new window.RTCIceCandidate(c)).catch(console.error)
        ));
      });

      setSearching(false);
      setIsConnecting(false);
    } catch (err) {
      setIsConnecting(false);
      disconnectFromCall();
    }
  };

  // --- Passive: Listen for incoming connections/offers
  useEffect(() => {
    if (!auth.currentUser) return undefined;
    const connRef = ref(db, 'connections');
    return onValue(connRef, async (snap) => {
      const all = snap.val() || {};
      for (const [cid, conn] of Object.entries(all)) {
        if (!connectionId && conn.offer && Array.isArray(conn.participants)
            && conn.participants.includes(auth.currentUser.uid)
            && !conn.answer) {
          const pc = createPeerConnection(disconnectFromCall);
          peerConnectionRef.current = pc;
          setConnectionId(cid);

          const stream = await requestCameraAndMic();
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));

          await pc.setRemoteDescription(new window.RTCSessionDescription(conn.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await set(ref(db, `connections/${cid}/answer`), answer.toJSON());

          const partnerId = conn.participants.find((p) => p !== auth.currentUser.uid);

          onValue(ref(db, `connections/${cid}/candidates/${partnerId}`), (s) => {
            const cands = s.val();
            if (cands) Object.values(cands).forEach((c) => (
              pc.addIceCandidate(new window.RTCIceCandidate(c)).catch(console.error)
            ));
          });
        }
      }
    });
  }, [connectionId, createPeerConnection]);

  // --- FRIENDS/REQUESTS HANDLERS
  async function handleAccept(reqId, fromUser) {
    const up = {
      [`friendRequests/${auth.currentUser.uid}/${reqId}`]          : null,
      [`friendRequests/${fromUser.uid}/${auth.currentUser.uid}`]   : null,
      [`friends/${auth.currentUser.uid}/${fromUser.uid}`]          : {
        uid: fromUser.uid, email: fromUser.email, addedAt: Date.now(),
      },
      [`friends/${fromUser.uid}/${auth.currentUser.uid}`]          : {
        uid: auth.currentUser.uid, email: auth.currentUser.email, addedAt: Date.now(),
      },
      [`notifications/${auth.currentUser.uid}/${reqId}`]           : null,
      [`notifications/${fromUser.uid}/${auth.currentUser.uid}`]    : null,
    };
    await update(ref(db), up);
    alert('Friend added!');
  }

  async function handleDecline(reqId, fromUid) {
    const up = {
      [`friendRequests/${auth.currentUser.uid}/${reqId}`]          : null,
      [`friendRequests/${fromUid}/${auth.currentUser.uid}`]        : null,
      [`notifications/${auth.currentUser.uid}/${reqId}`]           : null,
      [`notifications/${fromUid}/${auth.currentUser.uid}`]         : null,
    };
    await update(ref(db), up);
    alert('Request declined.');
  }

  async function handleRemoveFriend(fid, email) {
    if (!window.confirm(`Remove ${email}?`)) return;
    const up = {
      [`friends/${auth.currentUser.uid}/${fid}`]                   : null,
      [`friends/${fid}/${auth.currentUser.uid}`]                   : null,
      [`friendRequests/${auth.currentUser.uid}/${fid}`]            : null,
      [`friendRequests/${fid}/${auth.currentUser.uid}`]            : null,
    };
    await update(ref(db), up);
  }

  if (loading) return <div className="dashboard-loading">Loading…</div>;

  return (
    <div className="dashboard-container">
      {/* --- Sidebar --- */}
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
        <div className="online-count">
          {onlineCount} user{onlineCount !== 1 && 's'} online
        </div>
        <ul className="nav-menu">
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}>
              <img src={videoIcon} alt="" className="nav-icon" /> Video Chat
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}>
              <img src={chatIcon} alt="" className="nav-icon" /> Text Chat
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}>
              <img src={settingsIcon} alt="" className="nav-icon" /> Settings
            </button>
          </li>
        </ul>
        <div className="sidebar-footer">
          <button className="nav-link"
            onClick={async () => { await auth.signOut(); navigate('/'); }}>
            <img src={signoutIcon} alt="" className="nav-icon" /> Sign Out
          </button>
        </div>
      </aside>
      {/* --- Main Content --- */}
      <main className="main-content">
        {activeTab === 'video' && (
          <section className="video-chat-section">
            <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Random Stranger Video Chat</h2>
            <div className="video-container">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="local-video"
              />
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />
            </div>
            <div className="controls">
              {!searching && !connectionId && (
                <button
                  className="find-stranger-btn"
                  onClick={findStranger}
                  disabled={onlineCount < 2}
                >
                  {onlineCount < 2 ? 'Waiting for another user to come online...' : 'Find Stranger'}
                </button>
              )}
              {searching && (
                <button className="cancel-search-btn"
                  onClick={() => disconnectFromCall()}>
                  Cancel Search
                </button>
              )}
              {connectionId && (
                <button className="disconnect-btn"
                  onClick={() => disconnectFromCall()}>
                  Disconnect
                </button>
              )}
            </div>
            {isConnecting && (
              <p style={{ color: '#fff', textAlign: 'center' }}>
                Establishing secure connection…
              </p>
            )}
            {searching && (
              <div className="searching-status">
                <div className="spinner" /> Searching for a partner…
              </div>
            )}
          </section>
        )}
        {activeTab === 'text' && (
          <TextChat
            pendingRequests={pendingReqs}
            friendsData={friendsData}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel
            pendingReqs={pendingReqs}
            friendsData={friendsData}
            onAccept={(id, from) => handleAccept(id, from)}
            onDecline={(id, from) => handleDecline(id, from)}
            onRemoveFriend={(fid, email) => handleRemoveFriend(fid, email)}
          />
        )}
      </main>
    </div>
  );
}

/* Settings Panel Inline Sub-component */
function SettingsPanel({
  pendingReqs, friendsData, onAccept, onDecline, onRemoveFriend
}) {
  return (
    <div className="settings-section">
      <div className="friends-management">
        <h2>Friend Requests</h2>
        {pendingReqs.length ? pendingReqs.map((r) => (
          <div key={r.id} className="request-item">
            <span className="requester-email">{r.email}</span>
            <div className="request-actions">
              <button onClick={() => onAccept(r.id, r)}>Accept</button>
              <button onClick={() => onDecline(r.id, r.uid)}>Decline</button>
            </div>
          </div>
        )) : <p className="no-requests">No pending requests</p>}
      </div>
      <div className="friends-management">
        <h2>Friends</h2>
        {friendsData.list.length ? friendsData.list.map((f) => (
          <div key={f.id} className="friend-item">
            <span className="friend-email">
              <span className={`status-dot ${f.isOnline ? 'online' : 'offline'}`} />
              {f.email}
            </span>
            <button onClick={() => onRemoveFriend(f.id, f.email)}>Remove</button>
          </div>
        )) : <p className="no-friends">You have no friends yet.</p>}
      </div>
    </div>
  );
}

export default Dashboard;
