import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket, getBackendUrl, reconnectWithUrl } from '../socket';

export default function Home() {
  const { inviteCode } = useParams();
  const [playerName, setPlayerName] = useState(() => {
    try {
      return sessionStorage.getItem('mafia_player_name') || localStorage.getItem('mafia_player_name') || '';
    } catch (_) {
      return '';
    }
  });
  const [roomCode, setRoomCode] = useState(inviteCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getBackendUrl());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerInput, setCustomServerInput] = useState('');
  const timeoutRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (inviteCode) {
      setRoomCode(inviteCode);
    }
  }, [inviteCode]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const onRoomCreated = (code) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsLoading(false);
      navigate(`/room/${code}`);
    };

    const onRoomJoined = (code) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsLoading(false);
      navigate(`/room/${code}`);
    };

    const onError = (err) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsLoading(false);
      alert(typeof err === 'string' ? err : (err?.message || 'Failed to enter the room.'));
    };

    const onConnectError = (err) => {
      setIsLoading(false);
      console.warn('Telegraph line noise:', err?.message || err);
    };

    socket.on('room_created', onRoomCreated);
    socket.on('room_joined', onRoomJoined);
    socket.on('error', onError);
    socket.on('connect_error', onConnectError);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      socket.off('room_created', onRoomCreated);
      socket.off('room_joined', onRoomJoined);
      socket.off('error', onError);
      socket.off('connect_error', onConnectError);
    };
  }, [navigate]);

  const saveIdentity = (name, isHost) => {
    try {
      sessionStorage.setItem('mafia_player_name', name);
      sessionStorage.setItem('mafia_is_host', isHost ? 'true' : 'false');
      localStorage.setItem('mafia_player_name', name);
    } catch (_) {}
  };

  const handleCreateRoom = () => {
    const cleanName = playerName.trim();
    if (!cleanName) return alert('Please enter your name, Partner');
    
    if (!socket.connected) {
      socket.connect();
    }
    setIsLoading(true);
    saveIdentity(cleanName, true);
    console.log('Sending create_room request...');
    socket.emit('create_room', { playerName: cleanName });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      alert('Could not establish contact with the telegraph office. Please check your connection and try again.');
    }, 12000);
  };

  const handleJoinRoom = () => {
    const cleanName = playerName.trim();
    const code = (inviteCode || roomCode || '').trim();
    if (!cleanName) return alert('Please enter your name, Partner');
    if (!code) return alert('Please enter a secret room code');

    if (!socket.connected) {
      socket.connect();
    }
    setIsLoading(true);
    saveIdentity(cleanName, false);
    console.log('Sending join_room request for code:', code);
    socket.emit('join_room', { roomCode: code, playerName: cleanName });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      alert('The telegraph station did not respond. Please make sure the room exists and try again.');
    }, 12000);
  };

  const handleApplyCustomServer = () => {
    if (!customServerInput.trim()) return;
    reconnectWithUrl(customServerInput.trim());
    setServerUrl(getBackendUrl());
    setShowServerConfig(false);
    setCustomServerInput('');
  };

  return (
    <div className="landing-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="spinner-rustic"></div>
            <p>ASSEMBLING THE POSSE...</p>
            <small>(Cold start in progress, hold your horses!)</small>
          </div>
        </div>
      )}
      <div className="wanted-poster text-center">
        <h1>THE MAFIA</h1>
        <h2 style={{ marginTop: '-1rem', marginBottom: '2rem' }}>OUTLAWS</h2>

        <div className="input-group">
          <input
            type="text"
            placeholder="Enter Your Name, Partner"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (inviteCode || roomCode.trim()) {
                  handleJoinRoom();
                } else {
                  handleCreateRoom();
                }
              }
            }}
          />
        </div>

        <div className="action-groups">
          {!inviteCode && (
            <>
              <div className="create-section">
                <button className="btn btn-primary" onClick={handleCreateRoom}>
                  Start a Posse
                </button>
              </div>

              <div className="divider"><span>OR</span></div>
            </>
          )}

          <div className="join-section">
            {!inviteCode && (
              <input
                type="text"
                placeholder="Secret Room Code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJoinRoom();
                  }
                }}
                style={{ marginBottom: '1rem' }}
              />
            )}
            <button className="btn btn-secondary" onClick={handleJoinRoom}>
              {inviteCode ? `Join the ${inviteCode} Gang` : 'Join a Gang'}
            </button>
          </div>
        </div>

        {/* Server Connection Pill & Settings */}
        <div style={{ marginTop: '2rem', fontSize: '0.8rem', opacity: 0.85, fontFamily: 'Special Elite' }}>
          <div>
            <span>📡 Telegraph Line: </span>
            <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
              {serverUrl.replace(/^https?:\/\//, '')}
            </code>
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              style={{
                marginLeft: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-dark)',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.75rem'
              }}
            >
              {showServerConfig ? 'Close' : 'Switch Line'}
            </button>
          </div>

          {showServerConfig && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <input
                type="text"
                placeholder="https://your-tunnel.trycloudflare.com or 192.168.1.X:3001"
                value={customServerInput}
                onChange={(e) => setCustomServerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyCustomServer();
                }}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: '220px' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyCustomServer}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
              >
                Connect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
