import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { QRCodeSVG } from 'qrcode.react';
import SnakeGame from './SnakeGame';
import Chat from './Chat';

export default function Room() {
  try {
    const { code } = useParams();
    const navigate = useNavigate();
    const [room, setRoom] = useState(null);

    // Host configuration state in lobby
    const [gameMode, setGameMode] = useState('online'); // 'online' | 'offline'
    const [hostPlays, setHostPlays] = useState(true);
    const [dayDuration, setDayDuration] = useState(60);
    const [nightDuration, setNightDuration] = useState(45);
    const [numMafia, setNumMafia] = useState(1);
    const [hasDoctor, setHasDoctor] = useState(true);
    const [hasSheriff, setHasSheriff] = useState(true);

    // Gameplay interactive state
    const [selectedVoteTarget, setSelectedVoteTarget] = useState(null);
    const [selectedNightTarget, setSelectedNightTarget] = useState(null);
    const [sheriffResult, setSheriffResult] = useState(null);
    const [doctorConfirmed, setDoctorConfirmed] = useState(null);
    const [mafiaNominations, setMafiaNominations] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
      if (!socket.connected) {
        socket.connect();
      }

      const onRoomUpdate = (updatedRoom) => {
        setRoom(updatedRoom);
        if (updatedRoom.nightActions?.mafiaNominations) {
          setMafiaNominations(updatedRoom.nightActions.mafiaNominations);
        }
      };

      const onHostDisconnected = () => {
        alert('Host left the game. The room has been closed.');
        navigate('/');
      };

      const onSheriffResult = (data) => {
        setSheriffResult(data);
      };

      const onDoctorConfirmed = (data) => {
        setDoctorConfirmed(data);
      };

      const onMafiaNominationUpdate = (data) => {
        if (data.nominations) {
          setMafiaNominations(data.nominations);
        }
      };

      socket.on('room_update', onRoomUpdate);
      socket.on('host_disconnected', onHostDisconnected);
      socket.on('sheriff_result', onSheriffResult);
      socket.on('doctor_confirmed', onDoctorConfirmed);
      socket.on('mafia_nomination_update', onMafiaNominationUpdate);

      const savedName = sessionStorage.getItem('mafia_player_name');
      const isHost = sessionStorage.getItem('mafia_is_host') === 'true';

      socket.emit('get_room', { roomCode: code, playerName: savedName, isHost });

      return () => {
        socket.off('room_update', onRoomUpdate);
        socket.off('host_disconnected', onHostDisconnected);
        socket.off('sheriff_result', onSheriffResult);
        socket.off('doctor_confirmed', onDoctorConfirmed);
        socket.off('mafia_nomination_update', onMafiaNominationUpdate);
      };
    }, [navigate, code]);

    // Live countdown timer synced to server phaseEndsAt
    useEffect(() => {
      if (!room?.phaseEndsAt) {
        setTimeLeft(0);
        return;
      }

      const updateTimer = () => {
        const remaining = Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000));
        setTimeLeft(remaining);
      };

      updateTimer();
      const interval = setInterval(updateTimer, 500);
      return () => clearInterval(interval);
    }, [room?.phaseEndsAt]);

    // Reset night action selections when phase changes
    useEffect(() => {
      setSelectedNightTarget(null);
      setSelectedVoteTarget(null);
      if (room?.state === 'PLAYING_NIGHT') {
        setSheriffResult(null);
        setDoctorConfirmed(null);
      }
    }, [room?.state]);

    if (!room) {
      return (
        <div className="wanted-poster">
          <h2 className="text-center">Assembling the Posse...</h2>
          <p className="text-center" style={{ marginTop: '1rem', fontStyle: 'italic', opacity: 0.8 }}>
            Riding into town {code}...
          </p>
        </div>
      );
    }

    const me = room.players.find(p => p.id === socket.id);
    if (!me) {
      const savedName = sessionStorage.getItem('mafia_player_name') || 'Partner';
      const isHost = sessionStorage.getItem('mafia_is_host') === 'true';
      return (
        <div className="wanted-poster text-center">
          <h2>IDENTIFYING SUSPECT...</h2>
          <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>Reconnecting to the frontier frequency...</p>
          <button
            className="btn mt-4"
            onClick={() => socket.emit('get_room', { roomCode: code, playerName: savedName, isHost })}
          >
            ENTER TOWN SQUARE
          </button>
        </div>
      );
    }

    const isOnline = room.gameMode !== 'offline';
    const isGameOver = room.state === 'MAFIA_WIN' || room.state === 'CITIZENS_WIN';
    const myRole = (room.roles || {})[socket.id];
    const amIEliminated = (room.eliminated || []).includes(socket.id);
    const amIDon = myRole === 'Don' || room.activeDonId === socket.id;
    const amIMafia = myRole === 'Mafia' || myRole === 'Don';

    // Calculate living players and voters
    const livingPlayers = (room.players || []).filter(p => {
      if (!isOnline && p.isHost) return false;
      if (isOnline && room.hostPlays === false && p.isHost) return false;
      return !(room.eliminated || []).includes(p.id);
    });

    const livingMafia = livingPlayers.filter(p => {
      const r = (room.roles || {})[p.id];
      return r === 'Mafia' || r === 'Don';
    });

    // Calculate vote counts
    const voteCounts = {};
    if (room.votes) {
      Object.values(room.votes).forEach(targetId => {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
      });
    }
    const totalVotesCast = Object.keys(room.votes || {}).length;
    const livingVotersCount = livingPlayers.length;
    const hasAlreadyVoted = room.votes && room.votes[socket.id] !== undefined;

    // ==========================================
    // RENDER: LOBBY
    // ==========================================
    if (room.state === 'LOBBY') {
      const srvParam = typeof window !== 'undefined' && window.location.hostname.includes('trycloudflare.com')
        ? `?srv=${window.location.hostname}`
        : (typeof window !== 'undefined' && sessionStorage.getItem('mafia_backend_srv') ? `?srv=${sessionStorage.getItem('mafia_backend_srv')}` : '');
      const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://kek950.github.io';
      const rawBase = import.meta.env.BASE_URL || '/';
      const baseClean = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
      const inviteUrl = `${origin}${baseClean}/join/${code}${srvParam}`;
      const maxMafiaAllowed = Math.max(1, Math.floor((room.players.length - 1) / 2));

      return (
        <div className="room-container">
          <div className="wanted-poster">
            <h2 style={{ marginBottom: '1rem' }}>TOWN SQUARE LOBBY</h2>

            {me.isHost && (
              <div className="text-center" style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  background: '#fff',
                  padding: '1rem',
                  display: 'inline-block',
                  border: '4px solid var(--text-dark)',
                  boxShadow: '8px 8px 0px rgba(0,0,0,0.3)',
                  marginBottom: '1rem'
                }}>
                  <QRCodeSVG value={inviteUrl} size={160} level="H" />
                </div>
                <h3 style={{ color: 'var(--text-dark)', margin: 0, fontSize: '1.3rem', fontWeight: 'bold', fontFamily: 'Rye' }}>RECRUITMENT CODE</h3>
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

            {/* Posse Member List */}
            <div className="player-list mt-4">
              <h3 style={{ fontFamily: 'Rye', textAlign: 'center', marginBottom: '1rem' }}>
                THE POSSE ({room.players.length})
              </h3>
              {room.players.map(p => (
                <div key={p.id} className="player-card">
                  <span className="player-name">
                    {p.name} {p.id === socket.id && '(You)'}
                    {p.age && <span className="player-age-tag">({p.age} yrs)</span>}
                  </span>
                  <span className={`player-status ${p.isHost ? 'status-host' : 'status-alive'}`}>
                    {p.isHost ? 'WARDEN / HOST' : 'SUSPECT'}
                  </span>
                </div>
              ))}
            </div>

            {/* Host Configuration Panel */}
            {me.isHost ? (
              <div className="input-group mt-4" style={{ background: '#f3e6ce', padding: '1.2rem', border: '3px solid var(--text-dark)' }}>
                <h3 style={{ fontFamily: 'Rye', textAlign: 'center', marginBottom: '0.8rem' }}>DUEL SETTINGS</h3>

                {/* Game Mode Selector */}
                <label style={{ fontFamily: 'Rye' }}>Game Mode</label>
                <div className="mode-toggle-group">
                  <button
                    type="button"
                    className={`mode-btn ${gameMode === 'online' ? 'active' : ''}`}
                    onClick={() => setGameMode('online')}
                  >
                    🌐 Online (Self-Driving)
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${gameMode === 'offline' ? 'active' : ''}`}
                    onClick={() => setGameMode('offline')}
                  >
                    🏛️ Offline (Host Moderator)
                  </button>
                </div>
                <small style={{ fontStyle: 'italic', color: '#4a3320', fontWeight: 'bold', marginTop: '0.4rem', marginBottom: '0.8rem', display: 'block' }}>
                  {gameMode === 'online'
                    ? 'Automated phases, night actions, Don decision, and automatic hanging!'
                    : 'The host manually acts as narrator and controls Sunrise, Sunset, and Hangings.'}
                </small>

                {/* Online Specific Options */}
                {gameMode === 'online' && (
                  <>
                    <div style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0', fontFamily: 'Special Elite' }}>
                      <label style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                        <input
                          type="checkbox"
                          checked={hostPlays}
                          onChange={e => setHostPlays(e.target.checked)}
                        /> Host plays in duel
                      </label>
                    </div>

                    <label style={{ fontFamily: 'Rye', marginTop: '0.5rem' }}>High Noon Debate Time</label>
                    <select
                      value={dayDuration}
                      onChange={e => setDayDuration(Number(e.target.value))}
                      style={{ padding: '0.6rem', border: '2px solid var(--text-dark)', background: '#fffdf8', color: 'var(--text-dark)', fontFamily: 'Special Elite', fontWeight: 'bold' }}
                    >
                      <option value={45}>45 seconds (Fast Duel)</option>
                      <option value={60}>60 seconds (Standard)</option>
                      <option value={90}>90 seconds (Extended Debate)</option>
                    </select>

                    <label style={{ fontFamily: 'Rye', marginTop: '0.5rem' }}>Night Action Deadline</label>
                    <select
                      value={nightDuration}
                      onChange={e => setNightDuration(Number(e.target.value))}
                      style={{ padding: '0.6rem', border: '2px solid var(--text-dark)', background: '#fffdf8', color: 'var(--text-dark)', fontFamily: 'Special Elite', fontWeight: 'bold' }}
                    >
                      <option value={30}>30 seconds (Quick Night)</option>
                      <option value={45}>45 seconds (Standard Night)</option>
                      <option value={60}>60 seconds (Extended Night)</option>
                    </select>
                  </>
                )}

                {/* Roles Options */}
                <label style={{ fontFamily: 'Rye', marginTop: '0.8rem' }}>Number of Outlaws (Mafia)</label>
                <input
                  type="number"
                  min="1"
                  max={maxMafiaAllowed}
                  value={numMafia}
                  onChange={e => setNumMafia(Number(e.target.value))}
                />

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem', fontFamily: 'Special Elite' }}>
                  <label><input type="checkbox" checked={hasDoctor} onChange={e => setHasDoctor(e.target.checked)} /> Add Medic</label>
                  <label><input type="checkbox" checked={hasSheriff} onChange={e => setHasSheriff(e.target.checked)} /> Add Deputy</label>
                </div>

                <button
                  className="btn mt-4"
                  onClick={() => socket.emit('start_game', {
                    roomCode: code,
                    numMafia,
                    hasDoctor,
                    hasSheriff,
                    gameMode,
                    hostPlays,
                    dayDuration,
                    nightDuration
                  })}
                >
                  BEGIN THE DUEL
                </button>
              </div>
            ) : (
              <h3 className="mt-4 text-center">Waiting for the Warden to start the duel...</h3>
            )}

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <button className="btn btn-secondary" onClick={() => navigate(`/mini-game?room=${code}`)}>
                🎮 PLAY RATTLESNAKE RUSH
              </button>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>
                Wait for the posse by playing a mini-game. You'll be brought back automatically when the duel starts.
              </p>
            </div>
          </div>
          <Chat room={room} roomCode={code} me={me} />
        </div>
      );
    }

    // ==========================================
    // RENDER: GAME OVER
    // ==========================================
    if (isGameOver) {
      return (
        <div className="room-container">
          <div className="wanted-poster text-center">
            <h1>{room.state === 'MAFIA_WIN' ? 'OUTLAWS WIN! 🤠' : 'TOWN WINS! 🏛️'}</h1>
            <p style={{ fontFamily: 'Rye', fontSize: '1.2rem', marginBottom: '1.5rem', color: varColor(room.state) }}>
              {room.state === 'MAFIA_WIN'
                ? 'The Outlaws have overtaken the frontier!'
                : 'The Townsfolk have cleansed the frontier of banditry!'}
            </p>

            <div className="player-list">
              <h3 style={{ fontFamily: 'Rye', marginBottom: '0.8rem' }}>FINAL DOSSIERS</h3>
              {room.players.map(p => {
                const pRole = (room.roles || {})[p.id];
                const isElim = (room.eliminated || []).includes(p.id);
                return (
                  <div key={p.id} className="player-card" style={{ opacity: isElim ? 0.4 : 1 }}>
                    <div className="player-info">
                      <span style={{ fontWeight: 'bold' }}>{p.name} ({p.age} yrs) {p.id === socket.id && '(You)'}</span>
                      <span className="player-status" style={{ fontSize: '0.85rem' }}>
                        {isElim ? '🪦 DECEASED' : '🤠 SURVIVOR'} — {pRole?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {me.isHost && (
              <button
                className="btn mt-8"
                onClick={() => {
                  socket.emit('restart_game', { roomCode: code });
                }}
              >
                ANOTHER ROUND
              </button>
            )}
          </div>
          <Chat room={room} roomCode={code} me={me} />
        </div>
      );
    }

    // ==========================================
    // RENDER: ACTIVE DUEL (NIGHT & DAY)
    // ==========================================
    const isNight = room.state === 'PLAYING_NIGHT';
    const isDayVote = room.state === 'PLAYING_DAY_VOTE';
    const isDayRunoff = room.state === 'PLAYING_DAY_RUNOFF';
    const isVoting = isDayVote || isDayRunoff;
    const isDayResults = room.state === 'PLAYING_DAY_RESULTS';
    const isDay = isVoting || isDayResults;
    const runoffCandidates = room.runoffCandidates || [];

    // Mafia Don logic: living mafia count >= 4 requires target in nominations
    const requiresNomination = livingMafia.length >= 4;
    const nominatedTargetsList = Object.values(mafiaNominations);

    return (
      <div className="room-container">
        <div className="wanted-poster">
          <h2>
            {isNight && 'The Sun Sets... 🌙'}
            {isDayVote && 'High Noon: Posse Deliberation ☀️'}
            {isDayRunoff && 'High Noon: Run-Off Round 2 ⚖️'}
            {isDayResults && 'The Verdict Has Fallen ⚖️'}
          </h2>

          {/* Timers */}
          {isNight && isOnline && (
            <div className="text-center">
              <div className={`timer-pill ${timeLeft <= 10 ? 'urgent' : ''}`}>
                🌙 Night Moves: {timeLeft}s remaining
              </div>
            </div>
          )}
          {isDayVote && isOnline && (
            <div className="text-center">
              <div className={`timer-pill ${timeLeft <= 10 ? 'urgent' : ''}`}>
                ⏱️ High Noon Vote: {timeLeft}s remaining
              </div>
            </div>
          )}
          {isDayRunoff && isOnline && (
            <div className="text-center">
              <div className={`timer-pill urgent`} style={{ borderColor: 'var(--accent-red)' }}>
                ⚖️ RUN-OFF ROUND 2: {timeLeft}s remaining
              </div>
            </div>
          )}

          {/* Run-off Notification Banner */}
          {isDayRunoff && (
            <div className="runoff-banner">
              <div className="runoff-title">⚖️ RUN-OFF ROUND 2 — TIE BREAKER</div>
              <div className="runoff-desc">
                A tie occurred for the highest votes! Only the tied suspects below may be accused in this round:
                <strong>
                  {' '}
                  {runoffCandidates.map(id => room.players.find(p => p.id === id)?.name).filter(Boolean).join(' & ')}
                </strong>
              </div>
            </div>
          )}

          {/* Morning Gazette Bulletin during Voting */}
          {room.lastEliminated && isVoting && (
            <div className="morning-bulletin">
              <div className="bulletin-header">
                <span>📰 MORNING GAZETTE SPECIAL DISPATCH</span>
              </div>
              <div className="bulletin-body">
                <strong>{room.lastEliminated.name}</strong> ({room.lastEliminated.age} yrs) was {room.lastEliminated.reason === 'HANGED_BY_VOTE' ? 'sentenced to the gallows' : 'found murdered at dawn'}!
                &nbsp;—&nbsp;Identity: <strong>{room.lastEliminated.role.toUpperCase()}</strong>
              </div>
            </div>
          )}

          {/* Offline Moderator Host Actions */}
          {!isOnline && me.isHost && (
            <div className="text-center mb-4">
              <h3 style={{ fontFamily: 'Rye' }}>THE OVERSEER</h3>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                {isNight && <button className="btn" onClick={() => socket.emit('start_day_vote', { roomCode: code })}>☀️ SUNRISE</button>}
                {isVoting && <button className="btn btn-secondary" onClick={() => socket.emit('end_day_vote', { roomCode: code })}>TALLY BALLOTS</button>}
                {isDayResults && <button className="btn" onClick={() => socket.emit('start_night', { roomCode: code })}>🌙 SUNSET</button>}
              </div>
            </div>
          )}

          {/* Player Personal Role Badge */}
          <div className="text-center">
            <div className={`role-badge role-${myRole ? myRole.toLowerCase() : 'none'}`}>
              {myRole === 'Don' ? '👑 MAFIA DON' :
               myRole === 'Mafia' ? '🤠 OUTLAW' :
               myRole === 'Doctor' ? '⚕️ TOWN MEDIC' :
               myRole === 'Sheriff' ? '⭐ DEPUTY SHERIFF' :
               myRole === 'Citizen' ? '🏛️ INNOCENT TOWNSFOLK' : myRole}
            </div>

            {me.age && (
              <div style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#4a3320', marginBottom: '1rem', fontFamily: 'Special Elite' }}>
                Character Profile: {me.name}, {me.age} years of age
              </div>
            )}

            {amIEliminated && (
              <div style={{ background: '#5a0000', color: '#ffffff', padding: '0.6rem 1rem', marginBottom: '1.2rem', border: '2px solid #ff4d4d', fontFamily: 'Rye', fontSize: '1.1rem' }}>
                ☠️ YOU ARE PUSHING UP DAISIES (GHOST SPECTATOR)
              </div>
            )}
          </div>

          {/* ==========================================
              DECEASED CARD REVEAL (HANGED / SLAIN)
              ========================================== */}
          {room.lastEliminated && isDayResults && (
            <div className="death-card-overlay">
              <div className="death-card">
                <div className="death-card-header">
                  {room.lastEliminated.reason === 'HANGED_BY_VOTE'
                    ? '⚖️ SENTENCED TO THE GALLOWS'
                    : '☠️ SLAIN IN THE SHADOWS'}
                </div>
                <div className="death-card-name">{room.lastEliminated.name}</div>
                <div className="death-card-age">{room.lastEliminated.age} years old</div>
                <div>TRUE IDENTITY REVEALED:</div>
                <div className={`death-card-role-reveal ${room.lastEliminated.role.toLowerCase()}`}>
                  {room.lastEliminated.role === 'Don' ? '👑 MAFIA DON' :
                   room.lastEliminated.role === 'Mafia' ? '🤠 OUTLAW' :
                   room.lastEliminated.role === 'Doctor' ? '⚕️ TOWN MEDIC' :
                   room.lastEliminated.role === 'Sheriff' ? '⭐ DEPUTY SHERIFF' : '🏛️ INNOCENT TOWNSFOLK'}
                </div>
                <div>
                  <span className="death-card-stamp">DECEASED</span>
                </div>
                <div className="death-card-countdown">
                  Night falls in {timeLeft} seconds...
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              NIGHT ACTIONS INTERACTIVE PANEL (ONLINE)
              ========================================== */}
          {isNight && isOnline && !amIEliminated && (
            <div className="night-action-box">
              <div className="night-timer-warning">
                ⏱️ Night moves close in: <strong>{timeLeft}s</strong> remaining!
              </div>

              {/* MAFIA DON VIEW */}
              {amIDon && (
                <div>
                  <div className="night-action-title">👑 DON'S CONTRACT</div>
                  <div className="night-action-desc">
                    {requiresNomination
                      ? '⚠️ With 4+ Outlaws, you must choose a victim nominated by your gang!'
                      : 'You command the gang. Choose which townsperson will meet their maker tonight.'}
                  </div>

                  {Object.keys(mafiaNominations).length > 0 && (
                    <div className="gang-nominations-box">
                      <strong>Gang Nominations: </strong>
                      {Object.entries(mafiaNominations).map(([sId, tId]) => {
                        const targetPlayer = room.players.find(p => p.id === tId);
                        const sender = room.players.find(p => p.id === sId);
                        return targetPlayer ? `${sender?.name || 'Outlaw'} ➔ ${targetPlayer.name}` : null;
                      }).filter(Boolean).join(' | ')}
                    </div>
                  )}

                  {selectedNightTarget && (
                    <button
                      className="btn"
                      style={{ background: '#8b0000', color: '#ffffff', marginBottom: '0.5rem', border: '2px solid #ff4d4d' }}
                      onClick={() => socket.emit('don_kill', { roomCode: code, targetId: selectedNightTarget })}
                    >
                      💀 ORDER CONTRACT ON {room.players.find(p => p.id === selectedNightTarget)?.name}
                    </button>
                  )}
                </div>
              )}

              {/* REGULAR MAFIA MEMBER VIEW */}
              {myRole === 'Mafia' && !amIDon && (
                <div>
                  <div className="night-action-title">🤠 OUTLAW PROPOSAL</div>
                  <div className="night-action-desc">
                    Click a living townsperson below to offer / nominate them to the Don for elimination.
                  </div>
                  {selectedNightTarget && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        socket.emit('mafia_nominate', { roomCode: code, targetId: selectedNightTarget });
                        alert(`Offered ${room.players.find(p => p.id === selectedNightTarget)?.name} to the Don!`);
                      }}
                    >
                      🎯 PROPOSE {room.players.find(p => p.id === selectedNightTarget)?.name}
                    </button>
                  )}
                </div>
              )}

              {/* DOCTOR VIEW */}
              {myRole === 'Doctor' && (
                <div>
                  <div className="night-action-title">⚕️ MEDIC'S NIGHT ROUNDS</div>
                  <div className="night-action-desc">
                    Choose one citizen (or yourself) to guard and heal tonight. If targeted, they will survive!
                  </div>
                  {doctorConfirmed ? (
                    <div style={{ background: '#1b4d24', color: '#ffffff', padding: '0.5rem 1rem', borderRadius: '3px', fontWeight: 'bold', display: 'inline-block', marginBottom: '0.5rem', border: '1px solid #69f0ae' }}>
                      ✓ Guarding {doctorConfirmed.targetName} tonight.
                    </div>
                  ) : selectedNightTarget ? (
                    <button
                      className="btn"
                      style={{ background: '#1b5e20', color: '#ffffff', border: '2px solid #69f0ae' }}
                      onClick={() => socket.emit('doctor_heal', { roomCode: code, targetId: selectedNightTarget })}
                    >
                      💉 PROTECT {room.players.find(p => p.id === selectedNightTarget)?.name}
                    </button>
                  ) : null}
                </div>
              )}

              {/* SHERIFF VIEW */}
              {myRole === 'Sheriff' && (
                <div>
                  <div className="night-action-title">⭐ DEPUTY INVESTIGATION</div>
                  <div className="night-action-desc">
                    Pick one suspect below to investigate their criminal record.
                  </div>
                  {sheriffResult ? (
                    <div className={`sheriff-result-banner ${sheriffResult.result === 'OUTLAW' ? 'outlaw' : 'innocent'}`}>
                      Forensic Result: {sheriffResult.targetName} is an {sheriffResult.result}!
                    </div>
                  ) : selectedNightTarget ? (
                    <button
                      className="btn"
                      style={{ background: '#ffd54f', color: '#1f140a', border: '2px solid #c99700', fontWeight: 'bold' }}
                      onClick={() => socket.emit('sheriff_investigate', { roomCode: code, targetId: selectedNightTarget })}
                    >
                      🔍 INVESTIGATE {room.players.find(p => p.id === selectedNightTarget)?.name}
                    </button>
                  ) : null}
                </div>
              )}

              {/* CITIZEN VIEW */}
              {myRole === 'Citizen' && (
                <div>
                  <div className="night-action-title">🌙 TOWN IS SLEEPING</div>
                  <div className="night-action-desc">
                    Keep your window shutters bolted. Pray the town Medic is on guard and the Deputy finds the killers.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              PLAYER LIST & INTERACTIVE SELECTION
              ========================================== */}
          <div className="player-list">
            <h3 style={{ fontFamily: 'Rye', textAlign: 'center', marginBottom: '0.8rem' }}>
              TOWN REGISTRY ({livingPlayers.length} ALIVE)
            </h3>

            {room.players.map(p => {
              if (!isOnline && p.isHost) return null;
              if (isOnline && room.hostPlays === false && p.isHost) return null;

              const isEliminated = (room.eliminated || []).includes(p.id);
              const pRole = (room.roles || {})[p.id];
              const isSelectedDayVote = selectedVoteTarget === p.id;
              const isSelectedNightAction = selectedNightTarget === p.id;

              // Can this player vote?
              const isRunoffCandidate = isDayRunoff && runoffCandidates.includes(p.id);
              const canVoteThisPlayer = (
                isDayVote && !amIEliminated && !isEliminated && !hasAlreadyVoted && p.id !== socket.id
              ) || (
                isDayRunoff && !amIEliminated && !isEliminated && !hasAlreadyVoted && isRunoffCandidate
              );

              // Can select for night action?
              let canSelectNightAction = false;
              if (isNight && !amIEliminated && !isEliminated) {
                if (amIDon) {
                  const isTargetMafia = pRole === 'Mafia' || pRole === 'Don';
                  if (!isTargetMafia) {
                    // If 4+ mafia, must be in nominations
                    canSelectNightAction = requiresNomination ? nominatedTargetsList.includes(p.id) : true;
                  }
                } else if (myRole === 'Mafia') {
                  // Regular mafia can propose any non-mafia
                  const isTargetMafia = pRole === 'Mafia' || pRole === 'Don';
                  canSelectNightAction = !isTargetMafia;
                } else if (myRole === 'Doctor') {
                  canSelectNightAction = true; // Doctor can heal anyone
                } else if (myRole === 'Sheriff') {
                  canSelectNightAction = p.id !== socket.id; // Sheriff investigates others
                }
              }

              const isNominatedByGang = isNight && amIMafia && nominatedTargetsList.includes(p.id);
              const votesForThisPlayer = voteCounts[p.id] || 0;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (canVoteThisPlayer) setSelectedVoteTarget(p.id);
                    if (canSelectNightAction) setSelectedNightTarget(p.id);
                  }}
                  className={`player-card ${canVoteThisPlayer || canSelectNightAction ? 'votable' : ''} ${isSelectedDayVote || isSelectedNightAction ? 'voted' : ''}`}
                  style={{
                    opacity: isEliminated ? 0.35 : (isDayRunoff && !isRunoffCandidate ? 0.5 : 1),
                    cursor: (canVoteThisPlayer || canSelectNightAction) ? 'pointer' : 'default',
                    border: (isSelectedDayVote || isSelectedNightAction) ? '3px solid var(--accent-red)' : '1px solid var(--text-dark)'
                  }}
                >
                  <div className="player-info">
                    <span style={{ fontWeight: 'bold' }}>
                      {p.name} {p.id === socket.id && '(You)'}
                      {p.age && <span className="player-age-tag">({p.age} yrs)</span>}
                    </span>

                    {votesForThisPlayer > 0 && isVoting && (
                      <span className="vote-count" style={{ background: 'var(--accent-red)', borderRadius: '0' }}>
                        🗳️ {votesForThisPlayer}
                      </span>
                    )}

                    {isRunoffCandidate && (
                      <span style={{ background: 'var(--accent-red)', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>
                        ⚖️ TIED SUSPECT
                      </span>
                    )}

                    {isNominatedByGang && (
                      <span style={{ background: '#ff9800', color: '#000', fontSize: '0.7rem', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>
                        🎯 GANG TARGET
                      </span>
                    )}

                    {(isEliminated || (!isOnline && me.isHost)) && pRole && (
                      <span className="player-status" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
                        {pRole}
                      </span>
                    )}
                  </div>

                  {/* Offline Manual Host Elimination */}
                  {!isOnline && me.isHost && isNight && !isEliminated && (
                    <button
                      className="btn"
                      style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => socket.emit('night_kill', { roomCode: code, targetId: p.id })}
                    >
                      ELIMINATE
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ==========================================
              DAYTIME VOTING CONTROLS
              ========================================== */}
          {isVoting && !amIEliminated && (
            <div className="text-center mt-4">
              <div className="chat-open-hint">
                🏛️ <strong>Civil Chat is Open:</strong> Use the Town Square telegraph below to interrogate suspects and debate before voting!
              </div>

              <p style={{ fontFamily: 'Special Elite', marginTop: '0.5rem' }}>
                Ballots cast: {totalVotesCast} / {livingVotersCount}
              </p>

              {hasAlreadyVoted ? (
                <p className="success-message" style={{ color: '#1b5e20', background: '#e8f5e9', border: '2px solid #4caf50', padding: '0.6rem 1.2rem', display: 'inline-block', fontWeight: 'bold', fontSize: '1rem', marginTop: '0.5rem' }}>
                  ✓ Your ballot is officially cast in the box.
                </p>
              ) : (
                <button
                  className="btn mt-4"
                  style={{
                    background: selectedVoteTarget ? 'var(--accent-red)' : 'var(--wood-dark)',
                    cursor: selectedVoteTarget ? 'pointer' : 'not-allowed',
                    opacity: selectedVoteTarget ? 1 : 0.65
                  }}
                  disabled={!selectedVoteTarget}
                  onClick={() => {
                    if (selectedVoteTarget) {
                      socket.emit('submit_vote', { roomCode: code, targetId: selectedVoteTarget });
                      setSelectedVoteTarget(null);
                    }
                  }}
                >
                  {selectedVoteTarget
                    ? `ACCUSE ${room.players.find(p => p.id === selectedVoteTarget)?.name} 🪢`
                    : isDayRunoff ? 'SELECT TIED SUSPECT TO VOTE' : 'SELECT A SUSPECT TO VOTE'}
                </button>
              )}
            </div>
          )}
        </div>

        <Chat room={room} roomCode={code} me={me} />
      </div>
    );
  } catch (err) {
    return (
      <div className="glass-card" style={{ color: 'red' }}>
        <h2>Crash Detected</h2>
        <pre>{err.toString()}</pre>
      </div>
    );
  }
}

function varColor(winState) {
  return winState === 'MAFIA_WIN' ? 'var(--accent-red)' : '#2e7d32';
}
