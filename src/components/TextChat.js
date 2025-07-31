import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, db } from '../firebase/config';
import {
  ref,
  set,
  get,
  remove,
  update,
  onValue,
  onDisconnect,
  push,
} from 'firebase/database';
import './TextChat.css';
import lightIcon from './light-icon.png';
import sendIcon from './send.png';

function TextChat() {
  const [isSearching, setIsSearching] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [stranger, setStranger] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [strangerIsTyping, setStrangerIsTyping] = useState(false);
  const [searchCanceled, setSearchCanceled] = useState(false);
  const typingTimeoutRef = useRef(null);
  const chatWindowRef = useRef(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const userChatRef = ref(db, `textchat/users/${uid}/currentChat`);
    const unsubscribe = onValue(userChatRef, (snapshot) => {
      const roomId = snapshot.val();
      if (roomId) {
        setChatId(roomId);
        setIsSearching(false);

        const matchRef = ref(db, `textchat/matches/${roomId}`);
        get(matchRef).then((snap) => {
          const match = snap.val();
          if (match) {
            const strangerId = match.user1 === uid ? match.user2 : match.user1;
            setStranger(strangerId);

            const typingRef = ref(db, `textchat/chats/${roomId}/typing/${strangerId}`);
            onValue(typingRef, (snap) => {
              setStrangerIsTyping(snap.val() || false);
            });
          }
        });

        const chatRef = ref(db, `textchat/chats/${roomId}/messages`);
        onValue(chatRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const sorted = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
            setMessages(sorted);
          } else {
            setMessages([]);
          }
        });
      } else {
        setChatId(null);
        setStranger(null);
        setMessages([]);
        setStrangerIsTyping(false);
      }
    });

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  // Stable endChat function using useCallback
  const endChat = useCallback(async () => {
    if (!chatId || !uid) return;

    await update(ref(db), {
      [`textchat/users/${uid}/currentChat`]: null,
      ...(stranger ? { [`textchat/users/${stranger}/currentChat`]: null } : {}),
    });

    await remove(ref(db, `textchat/chats/${chatId}`));
    await remove(ref(db, `textchat/matches/${chatId}`));

    setChatId(null);
    setStranger(null);
    setMessages([]);
    setStrangerIsTyping(false);
  }, [chatId, uid, stranger]);

  // Esc key listener
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        endChat();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [endChat]);

  const findStranger = async () => {
    setIsSearching(true);
    setSearchCanceled(false);
    const myWaitRef = ref(db, `textchat/waiting/${uid}`);
    await set(myWaitRef, { timestamp: Date.now() });
    onDisconnect(myWaitRef).remove();

    const waitingRef = ref(db, 'textchat/waiting');

    const unsubscribe = onValue(waitingRef, async (snapshot) => {
      const waitingUsers = snapshot.val();
      if (!waitingUsers) return;

      const userIds = Object.keys(waitingUsers).filter((id) => id !== uid);
      if (userIds.length === 0) return;

      let partnerId = null;

      for (const id of userIds) {
        const partnerChatSnap = await get(ref(db, `textchat/users/${id}/currentChat`));
        const partnerChat = partnerChatSnap.val();
        if (!partnerChat) {
          partnerId = id;
          break;
        }
      }

      if (!partnerId) return;

      const myChatSnap = await get(ref(db, `textchat/users/${uid}/currentChat`));
      if (myChatSnap.exists()) return;

      const roomId = [uid, partnerId].sort().join('_');

      await Promise.all([
        remove(ref(db, `textchat/waiting/${uid}`)),
        remove(ref(db, `textchat/waiting/${partnerId}`)),
      ]);

      await set(ref(db, `textchat/matches/${roomId}`), {
        user1: uid,
        user2: partnerId,
        timestamp: Date.now(),
      });

      await update(ref(db), {
        [`textchat/users/${uid}/currentChat`]: roomId,
        [`textchat/users/${partnerId}/currentChat`]: roomId,
      });

      setChatId(roomId);
      setStranger(partnerId);
      setIsSearching(false);

      const chatRef = ref(db, `textchat/chats/${roomId}/messages`);
      onValue(chatRef, (snapshot) => {
        const msgs = snapshot.val();
        if (msgs) {
          const sorted = Object.values(msgs).sort((a, b) => a.timestamp - b.timestamp);
          setMessages(sorted);
        }
      });

      const typingRef = ref(db, `textchat/chats/${roomId}/typing/${partnerId}`);
      onValue(typingRef, (snapshot) => {
        setStrangerIsTyping(snapshot.val() || false);
      });

      unsubscribe();
      clearTimeout(timeoutId);
    });

    const timeoutId = setTimeout(() => {
      unsubscribe();
      remove(myWaitRef);
      setIsSearching(false);
      if (!searchCanceled) {
        alert('No match found, try again.');
      }
    }, 15000);
  };

  const sendMessage = async () => {
    if (!chatId || newMessage.trim() === '') return;
    const msgRef = ref(db, `textchat/chats/${chatId}/messages`);
    await push(msgRef, {
      sender: uid,
      text: newMessage.trim(),
      timestamp: Date.now(),
    });
    setNewMessage('');
    await set(ref(db, `textchat/chats/${chatId}/typing/${uid}`), false);
  };

  const handleTyping = () => {
    if (!chatId || !uid) return;
    set(ref(db, `textchat/chats/${chatId}/typing/${uid}`), true);

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      set(ref(db, `textchat/chats/${chatId}/typing/${uid}`), false);
    }, 1500);
  };

  const handleKeyDown = (e) => {
    handleTyping();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopSearching = async () => {
    setSearchCanceled(true);
    setIsSearching(false);
    if (uid) {
      await remove(ref(db, `textchat/waiting/${uid}`));
    }
  };

  return (
    <div className="text-chat-container">
      {!chatId && !isSearching && (
        <div className="chat-controls">
          <button className="start-chat-btn" onClick={findStranger}>
            <img src={lightIcon} alt="Light Icon" className="btn-icon-img" />
             Random Chat
          </button>
        </div>
      )}

      {isSearching && !chatId && (
        <div className="chat-controls">
          <div className="searching-status">
            <div className="searching-spinner"></div>
            <p>Looking for someone to chat with...</p>
          </div>
          <button onClick={stopSearching} className="stop-search-btn">
            Cancel
          </button>
        </div>
      )}

      {chatId && (
        <>
          <div className="chat-window" ref={chatWindowRef}>
            {messages.map((msg, idx) => {
              const isMe = msg.sender === uid;
              const showSender = idx === 0 || messages[idx - 1].sender !== msg.sender;

              return (
                <div key={idx} className={`message-row ${isMe ? 'from-me' : 'from-stranger'}`}>
                  {showSender && (
                    <span className={`sender-label ${isMe ? 'you' : 'stranger'}`}>
                      {isMe ? 'You' : 'Stranger'}
                    </span>
                  )}
                  <div className="message-text">{msg.text}</div>
                </div>
              );
            })}

            {strangerIsTyping && <p className="typing-indicator">Stranger is typing...</p>}
          </div>

          <div className="message-input">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage} className="send-button">
              <img src={sendIcon} alt="Send" className="send-icon-img" />
            </button>
          </div>

          <button className="end-chat" onClick={endChat}>
            End Chat
          </button>
        </>
      )}
    </div>
  );
}

export default TextChat;
