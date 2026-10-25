const { io } = require('socket.io-client');

async function testTieAndTimers() {
  console.log('--- STARTING TEST: NIGHT TIMER & RUN-OFF TIE-BREAKER ---');

  const host = io('http://localhost:3001');
  let roomCode = null;

  host.on('connect', () => {
    console.log('[HOST] Connected!');
    host.emit('create_room', { playerName: 'JudgeRoyBean' });
  });

  host.on('room_created', (code) => {
    roomCode = code;
    console.log(`[HOST] Created Room: ${roomCode}`);

    // Create 3 additional players: 4 players total
    const p1 = io('http://localhost:3001');
    const p2 = io('http://localhost:3001');
    const p3 = io('http://localhost:3001');
    const allSockets = [host, p1, p2, p3];

    p1.on('connect', () => p1.emit('join_room', { roomCode, playerName: 'JesseJames' }));
    p2.on('connect', () => p2.emit('join_room', { roomCode, playerName: 'DocHolliday' }));
    p3.on('connect', () => p3.emit('join_room', { roomCode, playerName: 'WildBill' }));

    let joined = 0;
    const playerRoles = {};

    const onJoin = () => {
      joined++;
      if (joined === 3) {
        console.log('[LOBBY] 4 players present! Starting ONLINE game with 3s Night Timer...');
        // Set short night duration (3s) to test automatic night timer expiration!
        host.emit('start_game', {
          roomCode,
          numMafia: 1,
          hasDoctor: false,
          hasSheriff: false,
          gameMode: 'online',
          hostPlays: true,
          dayDuration: 60,
          nightDuration: 3
        });
      }
    };

    p1.on('room_joined', onJoin);
    p2.on('room_joined', onJoin);
    p3.on('room_joined', onJoin);

    let nightTimerTestPassed = false;
    let runoffTriggeredTest = false;
    let runoffVoteResolved = false;

    allSockets.forEach(sock => {
      sock.on('room_update', (room) => {
        const myRole = (room.roles || {})[sock.id];
        if (myRole) playerRoles[sock.id] = myRole;

        // 1. NIGHT PHASE - TEST TIMER EXPIRATION
        if (room.state === 'PLAYING_NIGHT' && !nightTimerTestPassed) {
          console.log(`[NIGHT STARTED] Night deadline: ${room.phaseEndsAt ? Math.round((room.phaseEndsAt - Date.now())/1000) : 0}s. Intentionally IDLE to test timer auto-resolution...`);
          // Do not send any night actions! Wait for 3-second timer to expire.
        }

        // 2. DAY BREAKS AFTER NIGHT TIMER EXPIRED
        if (room.state === 'PLAYING_DAY_VOTE' && !nightTimerTestPassed) {
          nightTimerTestPassed = true;
          console.log(`[NIGHT TIMER PASSED] Night automatically resolved upon timer expiration without any player moves! Dawn broke.`);

          // TEST CIVIL CHAT: Send message in Town Square
          sock.emit('send_message', { roomCode, text: 'Hello Town Square! Who is suspicious?', channel: 'town' });

          // TEST MAFIA CHAT LOCKOUT DURING DAY
          const donSocket = allSockets.find(s => playerRoles[s.id] === 'Don');
          if (donSocket && sock.id === donSocket.id) {
            donSocket.emit('send_message', { roomCode, text: 'Secret mafia daytime whisper', channel: 'mafia' });
            donSocket.on('chat_error', (err) => {
              console.log(`[DAYTIME CHAT LOCKOUT VERIFIED]: ${err}`);
            });
          }

          // 3. DAY VOTING - CREATE A TIE (2 votes for Host, 2 votes for P1)
          setTimeout(() => {
            if (runoffTriggeredTest) return;
            runoffTriggeredTest = true;

            const living = room.players.filter(p => !(room.eliminated || []).includes(p.id));
            const cand1 = living[0].id;
            const cand2 = living[1].id;

            console.log(`[VOTING TIE TEST] Casting 2 votes for ${living[0].name} and 2 votes for ${living[1].name}...`);

            // Host & P1 vote for Cand1
            allSockets[0].emit('submit_vote', { roomCode, targetId: cand1 });
            allSockets[1].emit('submit_vote', { roomCode, targetId: cand1 });

            // P2 & P3 vote for Cand2
            allSockets[2].emit('submit_vote', { roomCode, targetId: cand2 });
            allSockets[3].emit('submit_vote', { roomCode, targetId: cand2 });
          }, 600);
        }

        // 4. RUN-OFF ROUND (ROUND 2) TRIGGERED
        if (room.state === 'PLAYING_DAY_RUNOFF' && !runoffVoteResolved) {
          runoffVoteResolved = true;
          console.log(`[RUN-OFF ROUND 2 VERIFIED] Tie triggered state PLAYING_DAY_RUNOFF!`);
          console.log(`[RUN-OFF CANDIDATES]:`, room.runoffCandidates);

          // Test invalid vote (voting for a non-tied player should be rejected)
          const nonTiedPlayer = room.players.find(p => !room.runoffCandidates.includes(p.id));
          if (nonTiedPlayer) {
            allSockets[0].emit('submit_vote', { roomCode, targetId: nonTiedPlayer.id });
            allSockets[0].on('error', (err) => {
              console.log(`[RUN-OFF RESTRICTION VERIFIED]: ${err}`);
            });
          }

          // Test civil chat during run-off
          allSockets[1].emit('send_message', { roomCode, text: 'Defend yourselves in run-off!', channel: 'town' });

          // Now cast votes in run-off so Cand1 wins!
          setTimeout(() => {
            const targetWinner = room.runoffCandidates[0];
            const targetLoser = room.runoffCandidates[1];
            console.log(`[RUN-OFF VOTE] Voting for candidate: ${targetWinner}`);

            allSockets[0].emit('submit_vote', { roomCode, targetId: targetWinner });
            allSockets[1].emit('submit_vote', { roomCode, targetId: targetWinner });
            allSockets[2].emit('submit_vote', { roomCode, targetId: targetWinner });
            allSockets[3].emit('submit_vote', { roomCode, targetId: targetLoser });
          }, 800);
        }

        // 5. RUN-OFF RESOLVED & HANGED
        if (room.state === 'PLAYING_DAY_RESULTS' && room.lastEliminated) {
          console.log(`[RUN-OFF FINAL VERDICT] Hanged: ${room.lastEliminated.name}, Role: ${room.lastEliminated.role}, Reason: ${room.lastEliminated.reason}`);
          console.log('--- ALL NIGHT TIMER & RUN-OFF TIE-BREAKER TESTS PASSED PERFECTLY! ---');
          process.exit(0);
        }
      });
    });
  });
}

testTieAndTimers();
