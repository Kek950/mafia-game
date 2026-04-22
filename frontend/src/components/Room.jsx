import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { QRCodeSVG } from 'qrcode.react';
import SnakeGame from './SnakeGame';

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
    
    // Cleanup: when component unmounts (player leaves), disconnect socket
    return () => { 
      socket.off('room_update', onRoomUpdate); 
      socket.off('host_disconnected', onHostDisconnected);
      socket.disconnect(); // This triggers the server-side removal logic
    };
  }, [navigate, code]);

  if (!room) return <div className="wanted-poster"><h2 className="text-center">Assembling the Posse...</h2></div>;

  const me = room.players.find(p => p.id === socket.id);
  if (!me) return null;

  if (room.state === 'LOBBY') {
    const inviteUrl = `${window.location.origin}/join/${code}`;
    return (
      <div className="wanted-poster">
        <h2 style={{ marginBottom: '1rem' }}>TOWN SQUARE</h2>

        {me.isHost && (
          <div className="text-center" style={{ marginBottom: '2rem' }}>
            <div style={{ 
              background: '#fff', 
              padding: '1rem', 
              borderRadius: '0', 
              display: 'inline-block',
              border: '4px solid var(--text-dark)',
              boxShadow: '8px 8px 0px rgba(0,0,0,0.3)',
              marginBottom: '1rem'
            }}>
              <QRCodeSVG value={inviteUrl} size={180} level="H" />
            </div>
            <h3 style={{ color: 'var(--text-dark)', margin: 0, fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'Rye' }}>RECRUITMENT CODE</h3>
          </div>
        )}

        <div 
          className="room-code-display" 
          style={{ cursor: 'pointer', margin: me.isHost ? '0 0 1rem 0' : '1rem 0' }}
          onClick={() => {
             navigator.clipboard.writeText(inviteUrl);
             alert('Recruitment link copied to clipboard!');
          }}
          title="Click to copy invite link"
        >
          {code}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dark)', marginTop: '0.5rem', letterSpacing: 'normal', fontFamily: 'Special Elite' }}>
             {me.isHost ? 'Click to copy recruitment link' : 'Secret Frequency'}
          </div>
        </div>

        <div className="player-list mt-4">
          <h3 style={{fontFamily: 'Rye', textAlign: 'center', marginBottom: '1rem'}}>THE POSSE</h3>
          {room.players.map(p => (
            <div key={p.id} className="player-card">
              <span className="player-name">{p.name} {p.id === socket.id && '(You)'}</span>
              <span className={`player-status ${p.isHost ? 'status-host' : 'status-alive'}`}>
                {p.isHost ? 'WARDEN' : 'SUSPECT'}
              </span>
            </div>
          ))}
        </div>
        {me.isHost ? (
          <div className="input-group mt-4">
            <label style={{fontFamily: 'Rye'}}>Nmuber of Outlaws</label>
            <input type="number" min="1" max={Math.max(1, room.players.length - 2)} value={numMafia} onChange={e => setNumMafia(Number(e.target.value))} />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontFamily: 'Special Elite' }}>
              <label><input type="checkbox" checked={hasDoctor} onChange={e => setHasDoctor(e.target.checked)} /> Add Medic</label>
              <label><input type="checkbox" checked={hasSheriff} onChange={e => setHasSheriff(e.target.checked)} /> Add Sheriff</label>
            </div>
            <button className="btn mt-4" onClick={() => socket.emit('start_game', { roomCode: code, numMafia, hasDoctor, hasSheriff })}>BEGIN THE DUEL</button>
          </div>
        ) : (
          <h3 className="mt-4 text-center">Waiting for the Warden to start...</h3>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/mini-game?room=${code}`)}>
            🎮 PLAY RATTLESNAKE RUSH
          </button>
          <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>Wait for the posse by playing a game. You'll be brought back automatically when the duel starts.</p>
        </div>
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
      <div className="wanted-poster text-center">
        <h1>{room.state === 'MAFIA_WIN' ? 'OUTLAWS WIN! 🤠' : 'TOWN WINS! 🏛️'}</h1>
        {me.isHost && (
          <button className="btn mt-8" onClick={() => {
            socket.emit('restart_game', { roomCode: code });
            window.location.reload(); // Reset the page to clear local states
          }}>
            ANOTHER ROUND
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wanted-poster">
      <h2>{room.state === 'PLAYING_NIGHT' ? 'The Sun Sets... 🌙' : 'High Noon ☀️'}</h2>

      {me.isHost ? (
        <div className="text-center mb-4">
          <h3 style={{fontFamily: 'Rye'}}>THE OVERSEER</h3>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            {room.state === 'PLAYING_NIGHT' && <button className="btn" onClick={() => socket.emit('start_day_vote', { roomCode: code })}>☀️ SUNRISE</button>}
            {room.state === 'PLAYING_DAY_VOTE' && <button className="btn btn-secondary" onClick={() => socket.emit('end_day_vote', { roomCode: code })}>TALLY BALLOTS</button>}
            {room.state === 'PLAYING_DAY_RESULTS' && <button className="btn" onClick={() => socket.emit('start_night', { roomCode: code })}>🌙 SUNSET</button>}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`role-badge role-${myRole ? myRole.toLowerCase() : 'none'}`} style={{fontFamily: 'Rye', fontSize: '2rem', border: '4px double var(--text-dark)', padding: '1rem', marginBottom: '1.5rem'}}>
            {myRole === 'Mafia' ? 'OUTLAW' : myRole === 'Citizen' ? 'TOWNSFOLK' : myRole === 'Doctor' ? 'MEDIC' : myRole === 'Sheriff' ? 'DEPUTY' : myRole}
          </div>
          {amIEliminated && <h3 className="error-message" style={{background: 'rgba(139, 0, 0, 0.1)', color: 'var(--accent-red)'}}>YOU ARE PUSHING UP DAISIES</h3>}
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
              style={{ opacity: isEliminated ? 0.3 : 1, cursor: canPlayerVote ? 'pointer' : 'default', border: selectedVoteTarget === p.id ? '2px solid var(--accent-red)' : '1px solid var(--text-dark)' }}
            >
              <div className="player-info">
                <span style={{fontWeight: 'bold'}}>{p.name} {p.id === socket.id && '(You)'}</span>
                {votesForPlayer > 0 && <span className="vote-count" style={{background: 'var(--accent-red)', borderRadius: '0'}}>🗳️ {votesForPlayer}</span>}
                {(isEliminated || me.isHost) && <span className="player-status" style={{fontSize: '0.8rem', textTransform: 'uppercase'}}>{(room.roles || {})[p.id]}</span>}
              </div>

              {me.isHost && room.state === 'PLAYING_NIGHT' && !isEliminated && (
                <button className="btn" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }} onClick={() => socket.emit('night_kill', { roomCode: code, targetId: p.id })}>
                  ELIMINATE
                </button>
              )}
            </div>
          );
        })}
      </div>

      {room.state === 'PLAYING_DAY_VOTE' && !me.isHost && !amIEliminated && (
        <div className="text-center mt-4">
          <p style={{fontFamily: 'Special Elite'}}>Ballots cast: {totalVotesCast} / {livingVoters}</p>
          {hasAlreadyVoted ? (
             <p className="success-message" style={{color: 'green'}}>✓ Your ballot is in the box</p>
          ) : (
             <button 
                className="btn mt-4" 
                style={{ background: selectedVoteTarget ? 'var(--accent-red)' : 'var(--wood-dark)', cursor: selectedVoteTarget ? 'pointer' : 'not-allowed', opacity: selectedVoteTarget ? 1 : 0.6 }}
                disabled={!selectedVoteTarget}
                onClick={() => { 
                  if(selectedVoteTarget) {
                    socket.emit('submit_vote', { roomCode: code, targetId: selectedVoteTarget });
                    setSelectedVoteTarget(null);
                  }
                }}
             >
                {selectedVoteTarget 
                  ? `ACCUSE ${room.players.find(p => p.id === selectedVoteTarget)?.name}` 
                  : 'SELECT A SUSPECT'}
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
