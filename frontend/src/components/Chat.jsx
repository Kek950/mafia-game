import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

export default function Chat({ room, roomCode, me }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('town'); // 'town' | 'mafia' | 'dead'
  const [unreadMafia, setUnreadMafia] = useState(0);
  const [unreadTown, setUnreadTown] = useState(0);
  const [unreadDead, setUnreadDead] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [chatNotice, setChatNotice] = useState('');

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const myRole = (room?.roles || {})[socket.id];
  const amIEliminated = (room?.eliminated || []).includes(socket.id);
  const isHost = me?.isHost;
  const isNight = room?.state === 'PLAYING_NIGHT';
  const isDay = room?.state === 'PLAYING_DAY_VOTE' || room?.state === 'PLAYING_DAY_RUNOFF' || room?.state === 'PLAYING_DAY_RESULTS';
  const isVoting = room?.state === 'PLAYING_DAY_VOTE' || room?.state === 'PLAYING_DAY_RUNOFF';
  const isRunoff = room?.state === 'PLAYING_DAY_RUNOFF';
  const isGameActive = (room?.state || '').startsWith('PLAYING_');

  const isMafiaMember = myRole === 'Mafia' || myRole === 'Don';
  const canSeeMafia = (room?.gameMode === 'offline' && isHost) || isMafiaMember;
  const canSeeDead = (room?.gameMode === 'offline' && isHost) || amIEliminated;

  // Rule: during the day, mafia chat CANNOT be opened/used!
  // If daylight breaks and user is on mafia tab, auto-switch to town tab.
  useEffect(() => {
    if (isDay && activeTab === 'mafia') {
      setActiveTab('town');
    }
  }, [isDay, activeTab]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleNewMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);

      // Handle unread badges
      if (msg.channel === 'mafia' && activeTab !== 'mafia') {
        setUnreadMafia((c) => c + 1);
      } else if (msg.channel === 'dead' && activeTab !== 'dead') {
        setUnreadDead((c) => c + 1);
      } else if (msg.channel === 'town' && activeTab !== 'town') {
        setUnreadTown((c) => c + 1);
      }
    };

    const handleRoomMessages = (loadedMessages) => {
      if (Array.isArray(loadedMessages)) {
        setMessages(loadedMessages);
      }
    };

    const handleChatError = (err) => {
      setChatNotice(err);
      setTimeout(() => setChatNotice(''), 4000);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('room_messages', handleRoomMessages);
    socket.on('chat_error', handleChatError);

    socket.emit('get_room_messages', { roomCode });

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('room_messages', handleRoomMessages);
      socket.off('chat_error', handleChatError);
    };
  }, [roomCode, activeTab]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab, isCollapsed]);

  const handleTabSwitch = (tab) => {
    // Prevent switching to mafia chat in broad daylight
    if (tab === 'mafia' && isDay) {
      setChatNotice('Outlaws cannot whisper in broad daylight! Speak in the Town Square.');
      setTimeout(() => setChatNotice(''), 3000);
      return;
    }

    setActiveTab(tab);
    if (tab === 'town') setUnreadTown(0);
    if (tab === 'mafia') setUnreadMafia(0);
    if (tab === 'dead') setUnreadDead(0);
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Check daytime restriction on mafia channel
    if (activeTab === 'mafia' && isDay) {
      setChatNotice('Outlaws cannot whisper in broad daylight!');
      setTimeout(() => setChatNotice(''), 3000);
      return;
    }

    // Check night restriction on town channel
    if (activeTab === 'town' && isNight && !(room?.gameMode === 'offline' && isHost)) {
      setChatNotice('The town is fast asleep. Keep quiet until sunrise!');
      setTimeout(() => setChatNotice(''), 3000);
      return;
    }

    let channelToSend = activeTab;
    if (amIEliminated && isGameActive) {
      channelToSend = 'dead';
    }

    socket.emit('send_message', {
      roomCode,
      text: trimmed,
      channel: channelToSend
    });

    setInputText('');
  };

  const handleQuickReaction = (phrase) => {
    if (activeTab === 'town' && isNight && !(room?.gameMode === 'offline' && isHost)) {
      setChatNotice('The town is sleeping. No sound allowed!');
      setTimeout(() => setChatNotice(''), 3000);
      return;
    }
    if (activeTab === 'mafia' && isDay) {
      setChatNotice('Outlaws cannot whisper in broad daylight!');
      setTimeout(() => setChatNotice(''), 3000);
      return;
    }

    let channelToSend = activeTab;
    if (amIEliminated && isGameActive) {
      channelToSend = 'dead';
    }

    socket.emit('send_message', {
      roomCode,
      text: phrase,
      channel: channelToSend
    });
  };

  const filteredMessages = messages.filter((msg) => {
    if (msg.isSystem) {
      if (activeTab === 'mafia') return msg.channel === 'mafia';
      return activeTab === 'town';
    }
    if (activeTab === 'mafia') {
      return msg.channel === 'mafia';
    }
    if (activeTab === 'dead') {
      return msg.channel === 'dead';
    }
    return msg.channel === 'town';
  });

  const isTownChatLocked = activeTab === 'town' && isNight && !(room?.gameMode === 'offline' && isHost);
  const isMafiaChatDayLocked = activeTab === 'mafia' && isDay;
  const isGraveyardForced = amIEliminated && isGameActive;

  return (
    <div className={`chat-wrapper ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="chat-header">
        <div className="chat-title">
          <span>📜 SALOON DISPATCH</span>
        </div>
        <button
          className="chat-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Telegraph' : 'Collapse Telegraph'}
        >
          {isCollapsed ? '▲ Open Chat' : '▼ Minimize'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Channel Tabs */}
          <div className="chat-tabs">
            <button
              className={`chat-tab ${activeTab === 'town' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('town')}
            >
              🏛️ Town Square
              {unreadTown > 0 && <span className="tab-badge">{unreadTown}</span>}
            </button>

            {canSeeMafia && (
              <button
                className={`chat-tab tab-mafia ${activeTab === 'mafia' ? 'active' : ''} ${isDay ? 'tab-disabled' : ''}`}
                onClick={() => handleTabSwitch('mafia')}
                title={isDay ? 'Outlaws cannot whisper in broad daylight!' : 'Secret Outlaw Hideout'}
              >
                🤠 Outlaw Hideout {isDay && '🔒'}
                {unreadMafia > 0 && !isDay && <span className="tab-badge badge-red">{unreadMafia}</span>}
              </button>
            )}

            {canSeeDead && (
              <button
                className={`chat-tab tab-dead ${activeTab === 'dead' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('dead')}
              >
                👻 Graveyard
                {unreadDead > 0 && <span className="tab-badge badge-ghost">{unreadDead}</span>}
              </button>
            )}
          </div>

          {/* Chat Notice / Alert */}
          {chatNotice && (
            <div className="chat-notice">
              ⚠️ {chatNotice}
            </div>
          )}

          {/* Messages Feed */}
          <div className="chat-messages-container" ref={chatContainerRef}>
            {activeTab === 'town' && isRunoff && (
              <div className="chat-day-banner runoff">
                ⚖️ <strong>RUN-OFF ROUND 2 OPEN:</strong> Civil debate in session! Interrogate the tied suspects before voting concludes!
              </div>
            )}
            {activeTab === 'town' && isVoting && !isRunoff && (
              <div className="chat-day-banner">
                🏛️ <strong>TOWN SQUARE OPEN:</strong> High Noon civil debate is in session! Coordinate and discuss before casting your ballot.
              </div>
            )}

            {filteredMessages.length === 0 ? (
              <div className="chat-empty">
                {activeTab === 'town' && 'Tumbleweeds drift across the square... No messages yet.'}
                {activeTab === 'mafia' && (isDay ? 'Locked during the day.' : 'Whisper your dark plans here. Townsfolk cannot hear.')}
                {activeTab === 'dead' && 'Rest in peace. Ghosts convene in this graveyard.'}
              </div>
            ) : (
              filteredMessages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="chat-msg system-msg">
                      <span className="system-text">{msg.text}</span>
                    </div>
                  );
                }

                const isMe = msg.senderId === socket.id;
                const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={msg.id}
                    className={`chat-msg ${isMe ? 'msg-outgoing' : 'msg-incoming'} ${
                      msg.channel === 'mafia' ? 'msg-mafia' : ''
                    } ${msg.channel === 'dead' ? 'msg-dead' : ''}`}
                  >
                    <div className="msg-header">
                      <span className="msg-sender">
                        {msg.senderName} {isMe && '(You)'}
                      </span>
                      {msg.role === 'Don' && <span className="msg-badge badge-don">👑 DON</span>}
                      {msg.role === 'Mafia' && <span className="msg-badge badge-outlaw">🤠 OUTLAW</span>}
                      {msg.role === 'Host' && <span className="msg-badge badge-host">WARDEN</span>}
                      {msg.isDead && <span className="msg-badge badge-ghost">👻 GHOST</span>}
                      <span className="msg-time">{timeStr}</span>
                    </div>
                    <div className="msg-body">{msg.text}</div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reaction Chips */}
          {!isTownChatLocked && !isMafiaChatDayLocked && (
            <div className="chat-quick-chips">
              <button type="button" onClick={() => handleQuickReaction("I'm completely innocent! 😇")}>
                😇 Innocent
              </button>
              <button type="button" onClick={() => handleQuickReaction("You're mighty suspicious! 🧐")}>
                🧐 Sus!
              </button>
              <button type="button" onClick={() => handleQuickReaction("Vote them out! 🗳️")}>
                🗳️ Vote!
              </button>
              <button type="button" onClick={() => handleQuickReaction("Trust me on this! 🤝")}>
                🤝 Trust
              </button>
              {canSeeMafia && activeTab === 'mafia' && isNight && (
                <button type="button" onClick={() => handleQuickReaction("Don, who gets the lead tonight? 🎯")}>
                  🎯 Target?
                </button>
              )}
            </div>
          )}

          {/* Chat Input Bar */}
          <form className="chat-input-bar" onSubmit={handleSendMessage}>
            {isTownChatLocked ? (
              <div className="chat-locked-indicator">
                🌙 The town is asleep. Silence is enforced until daybreak.
              </div>
            ) : isMafiaChatDayLocked ? (
              <div className="chat-locked-indicator">
                ☀️ Outlaws cannot whisper in broad daylight! Switch to Town Square.
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder={
                    isGraveyardForced
                      ? '👻 Speak from beyond the grave...'
                      : activeTab === 'mafia'
                      ? '🤠 Whisper secret outlaw orders...'
                      : '💬 Type telegraph message, partner...'
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={300}
                />
                <button type="submit" className="chat-send-btn" disabled={!inputText.trim()}>
                  SEND
                </button>
              </>
            )}
          </form>
        </>
      )}
    </div>
  );
}
