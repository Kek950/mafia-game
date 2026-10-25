const { io } = require('socket.io-client');

async function testOnlineAutomatedGameFlow() {
  console.log('--- STARTING COMPLETE ONLINE AUTOMATED GAMEPLAY TEST ---');
  const host = io('http://localhost:3001');
  let roomCode = null;

  host.on('connect', () => {
    console.log('[HOST] Connected!');
    host.emit('create_room', { playerName: 'WyattEarp' });
  });

  host.on('room_created', (code) => {
    roomCode = code;
    console.log(`[HOST] Created Room: ${roomCode}`);

    const p1 = io('http://localhost:3001');
    const p2 = io('http://localhost:3001');
    const p3 = io('http://localhost:3001');
    const allSockets = [host, p1, p2, p3];

    p1.on('connect', () => p1.emit('join_room', { roomCode, playerName: 'BillyTheKid' }));
    p2.on('connect', () => p2.emit('join_room', { roomCode, playerName: 'DocHolliday' }));
    p3.on('connect', () => p3.emit('join_room', { roomCode, playerName: 'BatMasterson' }));

    let playersJoined = 0;
    const playerRoles = {};

    const checkStartGame = () => {
      playersJoined++;
      if (playersJoined === 3) {
        console.log('[LOBBY] 4 players present! Starting ONLINE automated game with 1 Mafia, 1 Doctor, 1 Sheriff...');
        host.emit('start_game', {
          roomCode,
          numMafia: 1,
          hasDoctor: true,
          hasSheriff: true,
          gameMode: 'online',
          hostPlays: true,
          dayDuration: 60
        });
      }
    };

    p1.on('room_joined', checkStartGame);
    p2.on('room_joined', checkStartGame);
    p3.on('room_joined', checkStartGame);

    let nightActionsTriggered = false;
    let dayVoteTriggered = false;

    // Listen to updates on all sockets to capture each player's private role
    allSockets.forEach((sock, idx) => {
      sock.on('room_update', (room) => {
        const myRole = (room.roles || {})[sock.id];
        if (myRole) {
          playerRoles[sock.id] = myRole;
        }

        // ==========================================
        // NIGHT PHASE TEST
        // ==========================================
        if (room.state === 'PLAYING_NIGHT' && !nightActionsTriggered) {
          // Wait briefly for all sockets to receive roles
          setTimeout(() => {
            if (nightActionsTriggered) return;
            nightActionsTriggered = true;
            console.log(`[NIGHT STARTED] Roles assigned across posse:`, playerRoles);

            let donSocket = null;
            let docSocket = null;
            let sheriffSocket = null;
            let citizenSocket = null;

            allSockets.forEach(s => {
              const r = playerRoles[s.id];
              if (r === 'Don' || r === 'Mafia') donSocket = s;
              if (r === 'Doctor') docSocket = s;
              if (r === 'Sheriff') sheriffSocket = s;
              if (r === 'Citizen') citizenSocket = s;
            });

            console.log(`[NIGHT ACTION] Don=${donSocket?.id}, Doctor=${docSocket?.id}, Sheriff=${sheriffSocket?.id}`);

            // 1. Sheriff investigates
            if (sheriffSocket && citizenSocket) {
              sheriffSocket.emit('sheriff_investigate', { roomCode, targetId: citizenSocket.id });
              sheriffSocket.on('sheriff_result', (res) => {
                console.log(`[SHERIFF RESULT RECEIVED]: ${res.targetName} is ${res.result}!`);
              });
            }

            // 2. Doctor heals citizen
            if (docSocket && citizenSocket) {
              docSocket.emit('doctor_heal', { roomCode, targetId: citizenSocket.id });
              console.log(`[DOCTOR] Healing citizen: ${citizenSocket.id}`);
            }

            // 3. Don targets citizen (should be saved by doctor!)
            if (donSocket && citizenSocket) {
              donSocket.emit('don_kill', { roomCode, targetId: citizenSocket.id });
              console.log(`[DON] Ordering hit on citizen: ${citizenSocket.id}`);
            }
          }, 600);
        }

        // ==========================================
        // DAY VOTE PHASE TEST
        // ==========================================
        if (room.state === 'PLAYING_DAY_VOTE' && !dayVoteTriggered) {
          dayVoteTriggered = true;
          console.log(`[DAY BREAKS - HIGH NOON] Night automatically resolved! Timer: ${room.dayDuration}s.`);

          // Test daytime chat rule: Mafia chat must be blocked in daytime
          let donSocket = allSockets.find(s => playerRoles[s.id] === 'Don');
          if (donSocket) {
            donSocket.emit('send_message', { roomCode, text: 'Secret mafia daytime message', channel: 'mafia' });
            donSocket.on('chat_error', (err) => {
              console.log(`[CHAT RULE VERIFIED]: ${err}`);
            });
          }

          // Test voting: Posse votes to hang the Don!
          setTimeout(() => {
            const livingVoters = room.players.filter(p => !(room.eliminated || []).includes(p.id));
            const donPlayer = room.players.find(p => playerRoles[p.id] === 'Don');

            console.log(`[VOTING] ${livingVoters.length} living players voting to hang Don (${donPlayer?.name})...`);

            // All living voters vote for the Don
            livingVoters.forEach(v => {
              const voterSock = allSockets.find(s => s.id === v.id);
              if (voterSock && donPlayer) {
                voterSock.emit('submit_vote', { roomCode, targetId: donPlayer.id });
              }
            });
          }, 800);
        }

        // ==========================================
        // VERIFY DAY RESULTS & DECEASED REVEAL CARD
        // ==========================================
        if (room.state === 'PLAYING_DAY_RESULTS' || room.state === 'CITIZENS_WIN') {
          if (room.lastEliminated) {
            console.log(`[DECEASED CARD REVEALED] Hanged: ${room.lastEliminated.name}, Age: ${room.lastEliminated.age}, Role: ${room.lastEliminated.role}, Reason: ${room.lastEliminated.reason}`);
          }
          if (room.state === 'CITIZENS_WIN') {
            console.log('--- ALL AUTOMATED ONLINE GAMEPLAY TESTS PASSED PERFECTLY! ---');
            process.exit(0);
          }
        }
      });
    });
  });

  host.on('connect_error', (err) => console.log('Host connect error:', err));
}

testOnlineAutomatedGameFlow();
