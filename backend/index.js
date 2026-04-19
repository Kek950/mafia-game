const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateRoomCode, distributeRoles } = require('./gameLogic');
const { db } = require('./firebase');
const { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  arrayUnion
} = require('firebase/firestore');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const activeListeners = {};
const socketRooms = {};

// Manual win condition: Exclude host from player count
function checkWinConditions(room) {
  const livingPlayers = (room.players || []).filter(p => !p.isHost && !(room.eliminated || []).includes(p.id));
  const livingMafia = livingPlayers.filter(p => (room.roles || {})[p.id] === 'Mafia');
  const livingNonMafia = livingPlayers.filter(p => (room.roles || {})[p.id] !== 'Mafia');

  if (livingMafia.length === 0) return 'CITIZENS_WIN';
  if (livingMafia.length >= livingNonMafia.length) return 'MAFIA_WIN';
  return null;
}

io.on('connection', (socket) => {
  const setupRoomListener = (roomCode) => {
    if (activeListeners[roomCode]) return;
    const roomRef = doc(db, 'rooms', roomCode);
    activeListeners[roomCode] = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) io.to(roomCode).emit('room_update', snapshot.data());
    });
  };

  socket.on('create_room', async ({ playerName }) => {
    const roomCode = generateRoomCode();
    await setDoc(doc(db, 'rooms', roomCode), {
      id: roomCode,
      players: [{ id: socket.id, name: playerName, isHost: true }],
      state: 'LOBBY',
      roles: {},
      eliminated: [],
      votes: {},
      lastActivity: Date.now()
    });
    socketRooms[socket.id] = { roomCode, isHost: true };
    socket.join(roomCode);
    setupRoomListener(roomCode);
    socket.emit('room_created', roomCode);
  });

  socket.on('get_room', async ({ roomCode }) => {
    socket.join(roomCode);
    setupRoomListener(roomCode);
    const roomSnap = await getDoc(doc(db, 'rooms', roomCode));
    if (roomSnap.exists()) {
      socket.emit('room_update', roomSnap.data());
    }
  });

  socket.on('join_room', async ({ roomCode, playerName }) => {
    try {
      const roomRef = doc(db, 'rooms', roomCode);
      await updateDoc(roomRef, { players: arrayUnion({ id: socket.id, name: playerName, isHost: false }) });
      socketRooms[socket.id] = { roomCode, isHost: false };
      socket.join(roomCode);
      setupRoomListener(roomCode);
      socket.emit('room_joined', roomCode);
    } catch (e) {
      console.error('Error joining room:', e.message);
      socket.emit('error', 'Room not found or could not be joined');
    }
  });

  socket.on('start_game', async ({ roomCode, numMafia, hasDoctor, hasSheriff }) => {
    try {
      const roomRef = doc(db, 'rooms', roomCode);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const room = roomSnap.data();
        const roles = distributeRoles(room.players, numMafia, hasDoctor, hasSheriff);
        await updateDoc(roomRef, { state: 'PLAYING_NIGHT', roles });
      }
    } catch (e) {
      console.error('Error starting game:', e.message);
    }
  });

  // HOST-ONLY EVENTS (MANUAL)
  socket.on('start_day_vote', async ({ roomCode }) => {
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { state: 'PLAYING_DAY_VOTE', votes: {} });
    } catch (e) {
      console.error('Error starting day vote:', e.message);
    }
  });

  socket.on('end_day_vote', async ({ roomCode }) => {
    const roomRef = doc(db, 'rooms', roomCode);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const room = roomSnap.data();
      const votes = room.votes || {};
      const counts = {};
      Object.values(votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
      let max = 0, hungId = null;
      Object.entries(counts).forEach(([id, c]) => { if (c > max) { max = c; hungId = id; } });
      const eliminated = [...(room.eliminated || [])];
      if (hungId) eliminated.push(hungId);

      const winState = checkWinConditions({ ...room, eliminated });
      const nextState = winState || 'PLAYING_DAY_RESULTS';

      try {
        await updateDoc(roomRef, { state: nextState, lastHung: hungId, eliminated });
      } catch (e) {
        console.error('Error ending day vote:', e.message);
      }

      if (winState) {
        setTimeout(async () => {
          try { await deleteDoc(roomRef); } catch (e) {}
        }, 20000);
      }
    }
  });

  socket.on('start_night', async ({ roomCode }) => {
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { state: 'PLAYING_NIGHT', votes: {} });
    } catch (e) {
      console.error('Error starting night:', e.message);
    }
  });

  socket.on('night_kill', async ({ roomCode, targetId }) => {
    const roomRef = doc(db, 'rooms', roomCode);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const room = roomSnap.data();
      const updates = { lastKilled: targetId };
      const eliminated = [...(room.eliminated || [])];
      if (targetId) eliminated.push(targetId);

      const winState = checkWinConditions({ ...room, eliminated });
      
      updates.eliminated = eliminated;
      if (winState) {
        updates.state = winState;
      }
      
      try {
        await updateDoc(roomRef, updates);
      } catch (e) {
        console.error('Error in night kill:', e.message);
      }

      if (winState) {
        setTimeout(async () => {
          try { await deleteDoc(roomRef); } catch (e) {}
        }, 20000);
      }
    }
  });

  socket.on('submit_vote', async ({ roomCode, targetId }) => {
    try {
      const roomRef = doc(db, 'rooms', roomCode);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const votes = { ...(roomSnap.data().votes || {}) };
        votes[socket.id] = targetId;
        await updateDoc(roomRef, { votes });
      }
    } catch (e) {
      console.error('Error submitting vote:', e.message);
    }
  });

  socket.on('ping_activity', async ({ roomCode }) => {
    try {
      if (!roomCode) return;
      const roomRef = doc(db, 'rooms', roomCode);
      await updateDoc(roomRef, { lastActivity: Date.now() });
    } catch (e) {
      console.error('Error updating activity:', e.message);
    }
  });

  socket.on('destroy_room', async ({ roomCode }) => {
    try {
      const roomRef = doc(db, 'rooms', roomCode);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        await deleteDoc(roomRef);
        io.to(roomCode).emit('host_disconnected');
      }
    } catch (e) {
      console.error('Error destroying room:', e);
    }
  });

  socket.on('disconnect', async () => { 
    const info = socketRooms[socket.id];
    if (info) {
      if (info.isHost) {
        io.to(info.roomCode).emit('host_disconnected');
        try { await deleteDoc(doc(db, 'rooms', info.roomCode)); } catch (e) {}
      }
      delete socketRooms[socket.id];
    }
  });
});

server.listen(3001, () => {});
