import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

export default function Home() {
  const { inviteCode } = useParams();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(inviteCode || '');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (inviteCode) {
      setRoomCode(inviteCode);
    }
  }, [inviteCode]);

  useEffect(() => {
    socket.connect();

    socket.on('room_created', (code) => {
      setIsLoading(false);
      navigate(`/room/${code}`);
    });

    socket.on('room_joined', (code) => {
      setIsLoading(false);
      navigate(`/room/${code}`);
    });

    socket.on('error', (err) => {
      setIsLoading(false);
      alert(typeof err === 'string' ? err : (err?.message || 'Failed to enter the room.'));
    });

    socket.on('connect_error', (err) => {
      setIsLoading(false);
      console.warn('Telegraph line noise:', err?.message || err);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('error');
      socket.off('connect_error');
    };
  }, [navigate]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return alert('Please enter your name, Partner');
    if (!socket.connected) {
      socket.connect();
    }
    setIsLoading(true);
    sessionStorage.setItem('mafia_player_name', playerName.trim());
    sessionStorage.setItem('mafia_is_host', 'true');
    console.log('Sending create_room request...');
    socket.emit('create_room', { playerName: playerName.trim() });

    setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) {
          alert('Could not establish contact with the telegraph office. Please check your connection and try again.');
          return false;
        }
        return false;
      });
    }, 12000);
  };

  const handleJoinRoom = () => {
    const code = (inviteCode || roomCode || '').trim();
    if (!playerName.trim()) return alert('Please enter your name, Partner');
    if (!code) return alert('Please enter a secret room code');
    if (!socket.connected) {
      socket.connect();
    }
    setIsLoading(true);
    sessionStorage.setItem('mafia_player_name', playerName.trim());
    sessionStorage.setItem('mafia_is_host', 'false');
    console.log('Sending join_room request for code:', code);
    socket.emit('join_room', { roomCode: code, playerName: playerName.trim() });

    setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) {
          alert('The telegraph station did not respond. Please make sure the room exists and try again.');
          return false;
        }
        return false;
      });
    }, 12000);
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
        <h2 style={{marginTop: '-1rem', marginBottom: '2rem'}}>OUTLAWS</h2>

        <div className="input-group">
          <input
            type="text"
            placeholder="Enter Your Name, Partner"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                inviteCode ? handleJoinRoom() : handleCreateRoom();
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
                style={{marginBottom: '1rem'}}
              />
            )}
            <button className="btn btn-secondary" onClick={handleJoinRoom}>
              {inviteCode ? `Join the ${inviteCode} Gang` : 'Join a Gang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
