import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';

export default function Home() {
  const { inviteCode } = useParams();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(inviteCode || '');
  const navigate = useNavigate();

  useEffect(() => {
    socket.connect();

    socket.on('room_created', (code) => {
      navigate(`/room/${code}`);
    });

    socket.on('room_joined', (code) => {
      navigate(`/room/${code}`);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
    };
  }, [navigate]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return alert('Please enter your name');
    socket.emit('create_room', { playerName });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) return alert('Please enter name and room code');
    socket.emit('join_room', { roomCode, playerName });
  };

  return (
    <div className="landing-container">
      <div className="wanted-poster text-center">
        <h1>THE MAFIA</h1>
        <h2 style={{marginTop: '-1rem', marginBottom: '2rem'}}>OUTLAWS</h2>

        <div className="input-group">
          <input
            type="text"
            placeholder="Enter Your Name, Partner"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
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
