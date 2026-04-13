const { io } = require('socket.io-client');

async function testGameFlow() {
  console.log('--- STARTING GAME TEST ---');
  const host = io('http://localhost:3001');
  let roomCode = null;

  host.on('connect', () => {
    console.log('[HOST] Connected!');
    host.emit('create_room', { playerName: 'AdminHost' });
  });

  host.on('room_created', (code) => {
    roomCode = code;
    console.log(`[HOST] Created Room: ${roomCode}`);
    
    const player1 = io('http://localhost:3001');
    const player2 = io('http://localhost:3001');
    const player3 = io('http://localhost:3001');

    player1.on('connect', () => player1.emit('join_room', { roomCode, playerName: 'Player1' }));
    player2.on('connect', () => player2.emit('join_room', { roomCode, playerName: 'Player2' }));
    player3.on('connect', () => player3.emit('join_room', { roomCode, playerName: 'Player3' }));

    let playersJoined = 0;
    
    const checkStartGame = () => {
      playersJoined++;
      if(playersJoined === 3) {
         console.log('[HOST] Starting Game with 3 players!');
         host.emit('start_game', { roomCode, numMafia: 1, hasDoctor: true, hasSheriff: false });
      }
    };

    player1.on('room_joined', checkStartGame);
    player2.on('room_joined', checkStartGame);
    player3.on('room_joined', checkStartGame);

    player1.on('room_update', (room) => {
       if (room.state === 'PLAYING_NIGHT') {
           console.log(`[PLAYER1] Game Started! State: ${room.state}, My Role: ${room.roles[player1.id]}`);
           
           setTimeout(() => {
              console.log('--- TEST PASSED: PLAYERS RECEIVED ROLES WITHOUT CRASHING ---');
              process.exit(0);
           }, 1000);
       }
    });
  });

  host.on('connect_error', (err) => console.log('Host connect error:', err));
}

testGameFlow();