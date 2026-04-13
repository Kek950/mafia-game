import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { QRCodeSVG } from 'qrcode.react';

export default function Room() {
  try {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [numMafia, setNumMafia] = useState(1);
  const [hasDoctor, setHasDoctor] = useState(false);
  const [hasSheriff, setHasSheriff] = useState(false);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState(null);

  useEffect(() => {
    if (!socket.connected) { navigate('/'); return; }
    const onRoomUpdate = (updatedRoom) => { setRoom(updatedRoom); };
    const onHostDisconnected = () => {
      alert('Host left the game. The room has been closed.');
      navigate('/');
    };
    socket.on('room_update', onRoomUpdate);
    socket.on('host_disconnected', onHostDisconnected);
    socket.emit('get_room', { roomCode: code });
    return () => { 
      socket.off('room_update', onRoomUpdate); 
      socket.off('host_disconnected', onHostDisconnected);
    };
  }, [navigate, code]);

  if (!room) return <div className="glass-card"><h2 className="text-center">Loading Room...</h2></div>;

  const me = room.players.find(p => p.id === socket.id);
  if (!me) return null;

  if (room.state === 'LOBBY') {
    const inviteUrl = `${window.location.origin}/join/${code}`;
    return (
      <div className="glass-card">
        <h2 style={{ marginBottom: '1rem' }}>Lobby</h2>

        {me.isHost && (
          <div className="text-center" style={{ marginBottom: '2rem' }}>
            <div style={{ 
              background: '#fff', 
              padding: '1rem', 
              borderRadius: '16px', 
              display: 'inline-block',
              boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
              marginBottom: '1rem'
            }}>
              <QRCodeSVG value={inviteUrl} size={180} level="H" />
            </div>
            <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.4rem', fontWeight: 'bold' }}>Scan to Join</h3>
          </div>
        )}

        <div 
          className="room-code-display" 
          style={{ cursor: 'pointer', margin: me.isHost ? '0 0 1rem 0' : '1rem 0' }}
          onClick={() => {
             navigator.clipboard.writeText(inviteUrl);
             alert('Invite link copied to clipboard!');
          }}
          title="Click to copy invite link"
        >
          {code}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', letterSpacing: 'normal' }}>
             {me.isHost ? 'Or click to copy invite link' : 'Room Code'}
          </div>
        </div>

        <div className="player-list mt-4">
          {room.players.map(p => (
            <div key={p.id} className="player-card">
              <span className="player-name">{p.name} {p.id === socket.id && '(You)'}</span>
              <span className={`player-status ${p.isHost ? 'status-host' : 'status-alive'}`}>
                {p.isHost ? 'Host' : 'Player'}
              </span>
            </div>
          ))}
        </div>
        {me.isHost ? (
          <div className="input-group mt-4">
            <label>Number of Mafia</label>
            <input type="number" min="1" max={Math.max(1, room.players.length - 2)} value={numMafia} onChange={e => setNumMafia(Number(e.target.value))} />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <label><input type="checkbox" checked={hasDoctor} onChange={e => setHasDoctor(e.target.checked)} /> Add Doctor</label>
              <label><input type="checkbox" checked={hasSheriff} onChange={e => setHasSheriff(e.target.checked)} /> Add Sheriff</label>
            </div>
            <button className="btn mt-4" onClick={() => socket.emit('start_game', { roomCode: code, numMafia, hasDoctor, hasSheriff })}>Start Game</button>
          </div>
        ) : (
          <h3 className="mt-4 text-center">Waiting for host to setup game...</h3>
        )}
      </div>
    );
  }

  const myRole = (room.roles || {})[socket.id];
  const amIEliminated = (room.eliminated || []).includes(socket.id);
  const isGameOver = room.state === 'MAFIA_WIN' || room.state === 'CITIZENS_WIN';

  // Calculate vote counts
  const voteCounts = {};
  if (room.votes) {
    Object.values(room.votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });
  }
  const totalVotesCast = Object.keys(room.votes || {}).length;
  const livingVoters = room.players.filter(p => !p.isHost && !(room.eliminated || []).includes(p.id) && p.id !== socket.id).length;
  const hasAlreadyVoted = room.votes && room.votes[socket.id] !== undefined;

  if (isGameOver) {
    return (
      <div className="glass-card text-center">
        <h1>{room.state === 'MAFIA_WIN' ? 'MAFIA WINS! 👺' : 'CITIZENS WIN! 🛡️'}</h1>
        {me.isHost && <button className="btn mt-8" onClick={() => socket.emit('restart_game', { roomCode: code })}>Start New Game</button>}
      </div>
    );
  }

  return (
    <div className="glass-card">
      <h2>{room.state === 'PLAYING_NIGHT' ? 'Night Phase 🌙' : 'Day Phase ☀️'}</h2>

      {me.isHost ? (
        <div className="text-center mb-4">
          <h3>Game Master (Host Controlled)</h3>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            {room.state === 'PLAYING_NIGHT' && <button className="btn" onClick={() => socket.emit('start_day_vote', { roomCode: code })}>☀️ Start Day Voting</button>}
            {room.state === 'PLAYING_DAY_VOTE' && <button className="btn btn-danger" onClick={() => socket.emit('end_day_vote', { roomCode: code })}>Tally Votes</button>}
            {room.state === 'PLAYING_DAY_RESULTS' && <button className="btn" onClick={() => socket.emit('start_night', { roomCode: code })}>🌙 Start Night</button>}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`role-badge role-${myRole ? myRole.toLowerCase() : 'none'}`}>{myRole || 'Loading Role...'}</div>
          {amIEliminated && <h3 className="error-message">You have been eliminated</h3>}
        </div>
      )}

      <div className="player-list">
        {room.players.map(p => {
          if (p.isHost) return null;
          const isEliminated = (room.eliminated || []).includes(p.id);
          const canPlayerVote = !me.isHost && !amIEliminated && room.state === 'PLAYING_DAY_VOTE' && !isEliminated && !hasAlreadyVoted;
          const votesForPlayer = voteCounts[p.id] || 0;

          return (
            <div
              key={p.id}
              onClick={() => { if (canPlayerVote) setSelectedVoteTarget(p.id); }}
              className={`player-card ${canPlayerVote ? 'votable' : ''} ${selectedVoteTarget === p.id ? 'voted' : ''}`}
              style={{ opacity: isEliminated ? 0.5 : 1, cursor: canPlayerVote ? 'pointer' : 'default' }}
            >
              <div className="player-info">
                <span>{p.name} {p.id === socket.id && '(You)'}</span>
                {votesForPlayer > 0 && <span className="vote-count">🗳️ {votesForPlayer}</span>}
                {(isEliminated || me.isHost) && <span className="player-status">{(room.roles || {})[p.id]}</span>}
              </div>

              {me.isHost && room.state === 'PLAYING_NIGHT' && !isEliminated && (
                <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => socket.emit('night_kill', { roomCode: code, targetId: p.id })}>
                  Night Kill
                </button>
              )}
            </div>
          );
        })}
      </div>

      {room.state === 'PLAYING_DAY_VOTE' && !me.isHost && !amIEliminated && (
        <div className="text-center mt-4">
          <p>Votes cast: {totalVotesCast} / {livingVoters}</p>
          {hasAlreadyVoted ? (
             <p className="success-message">✓ Your vote has been recorded</p>
          ) : (
             <button 
                className="btn mt-4" 
                style={{ background: selectedVoteTarget ? 'var(--success-color)' : 'rgba(255,255,255,0.1)', cursor: selectedVoteTarget ? 'pointer' : 'not-allowed' }}
                disabled={!selectedVoteTarget}
                onClick={() => { 
                  if(selectedVoteTarget) {
                    socket.emit('submit_vote', { roomCode: code, targetId: selectedVoteTarget });
                    setSelectedVoteTarget(null);
                  }
                }}
             >
                {selectedVoteTarget 
                  ? `Confirm Vote for ${room.players.find(p => p.id === selectedVoteTarget)?.name}` 
                  : 'Select a player to vote'}
             </button>
          )}
        </div>
      )}
    </div>
  );
  } catch (err) {
    return <div className="glass-card" style={{color: 'red'}}><h2>Crash Detected</h2><pre>{err.toString()}</pre></div>;
  }
}
