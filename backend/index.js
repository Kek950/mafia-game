require('dotenv').config();
const express = require('express');

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateRoomCode, generateRandomAge, distributeRoles } = require('./gameLogic');
const { db } = require('./firebase');
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} = require('firebase/firestore');

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', online: true, activeRooms: Object.keys(roomsStore).length, time: new Date().toISOString() });
});

const path = require('path');
const fs = require('fs');
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const activeListeners = {};
const socketRooms = {};
const roomMessages = {};
const roomsStore = {};
const chatRateLimits = {};
const hostDisconnectTimers = {};
const dayTimers = {};
const nightTimers = {};

// Helper: Sanitize player names
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Partner';
  const clean = name.trim().replace(/[<>]/g, '').slice(0, 20);
  return clean || 'Partner';
}

// Helper: Verify if a socket is the designated host of a room
function isSocketHost(room, socketId) {
  if (!room || !Array.isArray(room.players)) return false;
  const player = room.players.find(p => p.id === socketId);
  return !!(player && player.isHost);
}

// Helper: Get living players considering online/offline mode
function getLivingPlayers(room) {
  const isOnline = room.gameMode !== 'offline';
  const hostPlays = isOnline ? (room.hostPlays !== false) : false;

  return (room.players || []).filter(p => {
    if (!hostPlays && p.isHost) return false;
    return !(room.eliminated || []).includes(p.id);
  });
}

// Helper: Get active Mafia Don (or acting Don if original Don is dead)
function getActiveDon(room) {
  const livingPlayers = getLivingPlayers(room);
  const livingMafia = livingPlayers.filter(p => {
    const r = (room.roles || {})[p.id];
    return r === 'Mafia' || r === 'Don';
  });

  const originalDon = livingMafia.find(p => (room.roles || {})[p.id] === 'Don');
  if (originalDon) return originalDon;
  return livingMafia.length > 0 ? livingMafia[0] : null;
}

// Helper: Mask sensitive role information per recipient to prevent role leakage
function emitSanitizedRoomUpdate(roomCode) {
  const room = roomsStore[roomCode];
  if (!room) return;

  const isGameOver = room.state === 'MAFIA_WIN' || room.state === 'CITIZENS_WIN';
  const activeDon = getActiveDon(room);

  (room.players || []).forEach(player => {
    const socketId = player.id;
    const myRole = (room.roles || {})[socketId];
    let sanitizedRoles = {};

    // In offline mode, the host is the overseer/moderator and sees all roles
    if (isGameOver || (room.gameMode === 'offline' && player.isHost)) {
      sanitizedRoles = room.roles || {};
    } else {
      if (myRole === 'Mafia' || myRole === 'Don') {
        // Mafia members see fellow Mafia comrades and Don
        Object.entries(room.roles || {}).forEach(([pId, r]) => {
          if (r === 'Mafia' || r === 'Don' || pId === socketId) {
            sanitizedRoles[pId] = r;
          }
        });
      } else if (myRole) {
        // Citizens, Doctors, Sheriffs ONLY see their own role!
        sanitizedRoles[socketId] = myRole;
      }

      // Always reveal roles of confirmed eliminated players to all
      (room.eliminated || []).forEach(pId => {
        if ((room.roles || {})[pId]) {
          sanitizedRoles[pId] = room.roles[pId];
        }
      });
    }

    const sanitizedRoom = {
      ...room,
      roles: sanitizedRoles,
      activeDonId: (myRole === 'Mafia' || myRole === 'Don' || player.isHost) ? (activeDon ? activeDon.id : null) : null
    };

    io.to(socketId).emit('room_update', sanitizedRoom);
  });
}

// In-memory state with safe non-blocking Firestore syncing
async function getRoomData(roomCode) {
  if (roomsStore[roomCode]) return roomsStore[roomCode];
  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    if (snap.exists()) {
      roomsStore[roomCode] = snap.data();
      return roomsStore[roomCode];
    }
  } catch (err) { }
  return null;
}

async function setRoomData(roomCode, data) {
  roomsStore[roomCode] = { ...data, id: roomCode };
  emitSanitizedRoomUpdate(roomCode);
  try {
    await setDoc(doc(db, 'rooms', roomCode), data);
  } catch (err) { }
}

async function updateRoomData(roomCode, updates) {
  if (!roomsStore[roomCode]) {
    await getRoomData(roomCode);
  }
  if (!roomsStore[roomCode]) return null;
  roomsStore[roomCode] = {
    ...roomsStore[roomCode],
    ...updates
  };
  emitSanitizedRoomUpdate(roomCode);
  try {
    await updateDoc(doc(db, 'rooms', roomCode), updates);
  } catch (err) { }
  return roomsStore[roomCode];
}

async function deleteRoomData(roomCode) {
  delete roomsStore[roomCode];
  delete roomMessages[roomCode];
  if (dayTimers[roomCode]) clearTimeout(dayTimers[roomCode]);
  if (nightTimers[roomCode]) clearTimeout(nightTimers[roomCode]);
  delete dayTimers[roomCode];
  delete nightTimers[roomCode];
  try {
    await deleteDoc(doc(db, 'rooms', roomCode));
  } catch (err) { }
}

function sendSystemMessage(roomCode, text, channel = 'town') {
  if (!roomCode || !text) return;
  const msg = {
    id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    senderId: 'system',
    senderName: 'TOWN CRIER',
    isSystem: true,
    text,
    channel,
    timestamp: Date.now()
  };
  if (!roomMessages[roomCode]) roomMessages[roomCode] = [];
  roomMessages[roomCode].push(msg);
  if (roomMessages[roomCode].length > 150) roomMessages[roomCode].shift();

  io.to(roomCode).emit('new_message', msg);
}

// Win conditions calculation
function checkWinConditions(room) {
  const livingPlayers = getLivingPlayers(room);
  const livingMafia = livingPlayers.filter(p => {
    const r = (room.roles || {})[p.id];
    return r === 'Mafia' || r === 'Don';
  });
  const livingNonMafia = livingPlayers.filter(p => {
    const r = (room.roles || {})[p.id];
    return r !== 'Mafia' && r !== 'Don';
  });

  if (livingPlayers.length === 0) return 'CITIZENS_WIN';
  if (livingMafia.length === 0) return 'CITIZENS_WIN';
  if (livingMafia.length >= livingNonMafia.length) return 'MAFIA_WIN';
  return null;
}

function handleGameOver(roomCode, winState) {
  if (dayTimers[roomCode]) clearTimeout(dayTimers[roomCode]);
  if (nightTimers[roomCode]) clearTimeout(nightTimers[roomCode]);
  delete dayTimers[roomCode];
  delete nightTimers[roomCode];

  if (winState === 'CITIZENS_WIN') {
    sendSystemMessage(roomCode, `🏆 VICTORY FOR THE TOWNSFOLK! The Outlaws have been eliminated!`);
  } else if (winState === 'MAFIA_WIN') {
    sendSystemMessage(roomCode, `💀 THE OUTLAWS RULE THE TOWN! The posse has been overwhelmed!`);
  }

  // Auto clean room after 40 seconds
  setTimeout(async () => {
    await deleteRoomData(roomCode);
  }, 40000);
}

// ==========================================
// AUTOMATED ONLINE GAMEPLAY STATE MACHINE
// ==========================================

// Check if all living active night roles have completed their actions
async function checkNightCompletion(roomCode) {
  const room = await getRoomData(roomCode);
  if (!room || room.state !== 'PLAYING_NIGHT') return;
  if (room.gameMode === 'offline') return; // manual mode

  const livingPlayers = getLivingPlayers(room);
  const livingMafia = livingPlayers.filter(p => {
    const r = (room.roles || {})[p.id];
    return r === 'Mafia' || r === 'Don';
  });
  const livingDoctor = livingPlayers.find(p => (room.roles || {})[p.id] === 'Doctor');
  const livingSheriff = livingPlayers.find(p => (room.roles || {})[p.id] === 'Sheriff');

  const na = room.nightActions || {};

  // 1. Don must choose kill (if any mafia alive)
  const mafiaDone = livingMafia.length === 0 || !!na.donKill;

  // 2. Doctor must choose heal (if doctor alive)
  const doctorDone = !livingDoctor || !!na.doctorHeal;

  // 3. Sheriff must choose investigate (if sheriff alive)
  const sheriffDone = !livingSheriff || !!na.sheriffChecked;

  console.log(`[NIGHT PROGRESS] Room ${roomCode}: Mafia=${mafiaDone}, Doctor=${doctorDone}, Sheriff=${sheriffDone}`);

  if (mafiaDone && doctorDone && sheriffDone) {
    console.log(`[NIGHT COMPLETE] All active roles played in room ${roomCode}. Resolving night...`);
    await resolveNight(roomCode);
  }
}

// Resolve night actions and start Day Phase
async function resolveNight(roomCode) {
  const room = await getRoomData(roomCode);
  if (!room || room.state !== 'PLAYING_NIGHT') return;

  if (nightTimers[roomCode]) {
    clearTimeout(nightTimers[roomCode]);
    delete nightTimers[roomCode];
  }

  const na = room.nightActions || {};
  const targetId = na.donKill;
  const doctorHealId = na.doctorHeal;

  let killedPlayer = null;
  const eliminated = [...(room.eliminated || [])];

  if (targetId) {
    if (doctorHealId && doctorHealId === targetId) {
      // Doctor saved the victim!
      sendSystemMessage(roomCode, `💉 Miraculous intervention! The town Medic treated the gunshot wound before dawn. No one died!`);
    } else {
      // Target is eliminated
      if (!eliminated.includes(targetId)) {
        eliminated.push(targetId);
      }
      killedPlayer = (room.players || []).find(p => p.id === targetId);
      if (killedPlayer) {
        const victimRole = (room.roles || {})[targetId] || 'Citizen';
        sendSystemMessage(roomCode, `☠️ A gunshot tore through the silence! ${killedPlayer.name} was found dead at daybreak. Identity: ${victimRole.toUpperCase()}`);
      }
    }
  } else {
    sendSystemMessage(roomCode, `🌅 The dawn breaks peacefully. The night claimed no casualties.`);
  }

  const winState = checkWinConditions({ ...room, eliminated });
  const nextState = winState || 'PLAYING_DAY_VOTE';

  const dayDuration = room.dayDuration || 60;
  const phaseEndsAt = nextState === 'PLAYING_DAY_VOTE' ? Date.now() + dayDuration * 1000 : null;

  const updates = {
    state: nextState,
    eliminated,
    votes: {},
    nightActions: {
      mafiaNominations: {},
      donKill: null,
      doctorHeal: null,
      sheriffChecked: null
    },
    phaseEndsAt,
    lastEliminated: killedPlayer ? {
      id: killedPlayer.id,
      name: killedPlayer.name,
      age: killedPlayer.age || generateRandomAge(),
      role: (room.roles || {})[killedPlayer.id] || 'Citizen',
      reason: 'KILLED_AT_NIGHT'
    } : null,
    lastActivity: Date.now()
  };

  await updateRoomData(roomCode, updates);

  if (winState) {
    handleGameOver(roomCode, winState);
    return;
  }

  // Start automated day countdown
  startDayTimer(roomCode, dayDuration);
}

// Start day countdown timer
function startDayTimer(roomCode, durationSeconds) {
  if (dayTimers[roomCode]) clearTimeout(dayTimers[roomCode]);
  dayTimers[roomCode] = setTimeout(async () => {
    await resolveDayVote(roomCode);
  }, durationSeconds * 1000);
}

// Start night countdown timer
function startNightTimer(roomCode, durationSeconds) {
  if (nightTimers[roomCode]) clearTimeout(nightTimers[roomCode]);
  nightTimers[roomCode] = setTimeout(async () => {
    console.log(`[NIGHT TIMER EXPIRED] Room ${roomCode} night timer (${durationSeconds}s) expired. Resolving night.`);
    await resolveNight(roomCode);
  }, durationSeconds * 1000);
}

// Check if all living voters have cast their votes
async function checkAllVoted(roomCode) {
  const room = await getRoomData(roomCode);
  if (!room || (room.state !== 'PLAYING_DAY_VOTE' && room.state !== 'PLAYING_DAY_RUNOFF')) return;
  if (room.gameMode === 'offline') return;

  const livingVoters = getLivingPlayers(room);
  const votedCount = Object.keys(room.votes || {}).length;

  if (votedCount >= livingVoters.length && livingVoters.length > 0) {
    console.log(`[DAY VOTE] All ${livingVoters.length} living players voted in room ${roomCode} (${room.state}). Resolving vote early!`);
    await resolveDayVote(roomCode);
  }
}

// Resolve Day Vote and display Hanged Card or trigger Run-Off
async function resolveDayVote(roomCode) {
  const room = await getRoomData(roomCode);
  if (!room || (room.state !== 'PLAYING_DAY_VOTE' && room.state !== 'PLAYING_DAY_RUNOFF')) return;

  if (dayTimers[roomCode]) {
    clearTimeout(dayTimers[roomCode]);
    delete dayTimers[roomCode];
  }

  const votes = room.votes || {};
  const counts = {};
  Object.values(votes).forEach(id => counts[id] = (counts[id] || 0) + 1);

  let maxVotes = 0;
  let topCandidates = [];
  Object.entries(counts).forEach(([id, c]) => {
    if (c > maxVotes) {
      maxVotes = c;
      topCandidates = [id];
    } else if (c === maxVotes) {
      topCandidates.push(id);
    }
  });

  console.log(`[DAY VOTE RESOLVE] Room ${roomCode} (${room.state}): maxVotes=${maxVotes}, topCandidates=${JSON.stringify(topCandidates)}`);

  // CHECK FOR TIE (2 or more players with highest vote count)
  if (topCandidates.length >= 2 && maxVotes > 0) {
    if (room.state === 'PLAYING_DAY_VOTE') {
      // First round tie -> TRIGGER SECOND ROUND (RUN-OFF)!
      const candidateNames = topCandidates
        .map(id => (room.players || []).find(p => p.id === id)?.name || 'Suspect')
        .join(' & ');

      sendSystemMessage(roomCode, `⚖️ TIE DETECTED! Both ${candidateNames} received ${maxVotes} votes! Entering RUN-OFF (Round 2). Only tied suspects may be voted on!`);

      const runoffDuration = Math.min(room.dayDuration || 60, 40);
      const updates = {
        state: 'PLAYING_DAY_RUNOFF',
        runoffCandidates: topCandidates,
        votes: {},
        phaseEndsAt: Date.now() + runoffDuration * 1000,
        lastActivity: Date.now()
      };

      await updateRoomData(roomCode, updates);
      startDayTimer(roomCode, runoffDuration);
      return;
    } else {
      // Already run-off round and still a tie -> DEADLOCK!
      sendSystemMessage(roomCode, `⚖️ DEADLOCK! The run-off vote also ended in a tie. The jury could not reach a consensus; the gallows remain empty today.`);
    }
  }

  // Clear winner or no votes
  let hungPlayer = null;
  const eliminated = [...(room.eliminated || [])];

  if (topCandidates.length === 1 && maxVotes > 0) {
    const hungId = topCandidates[0];
    if (!eliminated.includes(hungId)) {
      eliminated.push(hungId);
    }
    hungPlayer = (room.players || []).find(p => p.id === hungId);
    if (hungPlayer) {
      const hungRole = (room.roles || {})[hungId] || 'Citizen';
      sendSystemMessage(roomCode, `🪢 The posse has chosen! ${hungPlayer.name} was sentenced to the gallows! Identity: ${hungRole.toUpperCase()}`);
    }
  } else if (maxVotes === 0) {
    sendSystemMessage(roomCode, `⚖️ No accusations were cast. The gallows remain empty today.`);
  }

  const winState = checkWinConditions({ ...room, eliminated });
  const nextState = winState || 'PLAYING_DAY_RESULTS';

  const updates = {
    state: nextState,
    eliminated,
    runoffCandidates: [],
    phaseEndsAt: Date.now() + 8000, // 8 seconds to review reveal card
    lastEliminated: hungPlayer ? {
      id: hungPlayer.id,
      name: hungPlayer.name,
      age: hungPlayer.age || generateRandomAge(),
      role: (room.roles || {})[hungPlayer.id] || 'Citizen',
      reason: 'HANGED_BY_VOTE'
    } : null,
    lastActivity: Date.now()
  };

  await updateRoomData(roomCode, updates);

  if (winState) {
    handleGameOver(roomCode, winState);
    return;
  }

  // After 8 seconds of displaying the death card reveal, automatically begin Night!
  setTimeout(async () => {
    const latestRoom = await getRoomData(roomCode);
    if (latestRoom && latestRoom.state === 'PLAYING_DAY_RESULTS') {
      await startNightPhase(roomCode);
    }
  }, 8000);
}

// Transition to Night Phase
async function startNightPhase(roomCode) {
  const room = await getRoomData(roomCode);
  if (!room) return;

  const nightDuration = room.nightDuration || 45;
  const updates = {
    state: 'PLAYING_NIGHT',
    votes: {},
    runoffCandidates: [],
    nightActions: {
      mafiaNominations: {},
      donKill: null,
      doctorHeal: null,
      sheriffChecked: null
    },
    phaseEndsAt: room.gameMode === 'online' ? Date.now() + nightDuration * 1000 : null,
    lastActivity: Date.now()
  };

  await updateRoomData(roomCode, updates);
  sendSystemMessage(roomCode, `🌙 Night descends upon the frontier (${nightDuration}s). Citizens close your eyes. Outlaws roam the dark.`);

  if (room.gameMode === 'online') {
    startNightTimer(roomCode, nightDuration);
  }
}

// Periodic server-authoritative cleanup for stale rooms (30 minutes inactivity)
setInterval(() => {
  const now = Date.now();
  Object.keys(roomsStore).forEach(roomCode => {
    const room = roomsStore[roomCode];
    if (room && now - (room.lastActivity || 0) > 30 * 60 * 1000) {
      console.log(`[CLEANUP] Disbanding inactive room: ${roomCode}`);
      io.to(roomCode).emit('host_disconnected');
      deleteRoomData(roomCode);
    }
  });
}, 5 * 60 * 1000);

// ==========================================
// SOCKET CONNECTION & EVENT DISPATCH
// ==========================================

io.on('connection', (socket) => {
  const setupRoomListener = (roomCode) => {
    if (activeListeners[roomCode]) return;
    activeListeners[roomCode] = true;
    try {
      const roomRef = doc(db, 'rooms', roomCode);
      onSnapshot(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          roomsStore[roomCode] = snapshot.data();
          emitSanitizedRoomUpdate(roomCode);
        }
      }, () => { });
    } catch (e) { }
  };

  socket.on('create_room', async ({ playerName }) => {
    const cleanName = sanitizeName(playerName);
    const roomCode = generateRoomCode();
    const newRoom = {
      id: roomCode,
      players: [{ id: socket.id, name: cleanName, isHost: true, age: generateRandomAge() }],
      state: 'LOBBY',
      gameMode: 'online', // Default is online automated gameplay
      hostPlays: true,
      dayDuration: 60,
      roles: {},
      eliminated: [],
      votes: {},
      nightActions: {
        mafiaNominations: {},
        donKill: null,
        doctorHeal: null,
        sheriffChecked: null
      },
      lastEliminated: null,
      phaseEndsAt: null,
      lastActivity: Date.now()
    };
    await setRoomData(roomCode, newRoom);
    roomMessages[roomCode] = [];
    socketRooms[socket.id] = { roomCode, isHost: true };
    socket.join(roomCode);
    setupRoomListener(roomCode);
    socket.emit('room_created', roomCode);
    sendSystemMessage(roomCode, `🤠 Posse assembled by Warden ${cleanName}. Welcome to town!`);
  });

  socket.on('get_room', async ({ roomCode, playerName, isHost }) => {
    if (!roomCode || typeof roomCode !== 'string') return;
    socket.join(roomCode);
    setupRoomListener(roomCode);
    const room = await getRoomData(roomCode);
    if (room) {
      if (hostDisconnectTimers[roomCode]) {
        console.log(`[RECONNECT] Host/Player active in room ${roomCode}. Cancelling disband timer.`);
        clearTimeout(hostDisconnectTimers[roomCode]);
        delete hostDisconnectTimers[roomCode];
      }

      let player = (room.players || []).find(p => p.id === socket.id);
      if (!player && playerName) {
        const cleanName = sanitizeName(playerName);
        const existingHost = (room.players || []).find(p => p.isHost);

        if (isHost && (!existingHost || existingHost.name === cleanName)) {
          const updatedPlayers = (room.players || []).map(p => 
            p.isHost ? { ...p, id: socket.id, name: cleanName } : p
          );
          if (!existingHost) {
            updatedPlayers.push({ id: socket.id, name: cleanName, isHost: true, age: generateRandomAge() });
          }
          socketRooms[socket.id] = { roomCode, isHost: true };
          await updateRoomData(roomCode, { players: updatedPlayers });
        } else {
          const existingPlayer = (room.players || []).find(p => p.name === cleanName && !p.isHost);
          if (existingPlayer) {
            const oldId = existingPlayer.id;
            const updatedPlayers = (room.players || []).map(p => 
              p.id === oldId ? { ...p, id: socket.id } : p
            );
            const updatedRoles = { ...(room.roles || {}) };
            if (updatedRoles[oldId]) {
              updatedRoles[socket.id] = updatedRoles[oldId];
              delete updatedRoles[oldId];
            }
            socketRooms[socket.id] = { roomCode, isHost: false };
            await updateRoomData(roomCode, { players: updatedPlayers, roles: updatedRoles });
          }
        }
      } else if (player) {
        socketRooms[socket.id] = { roomCode, isHost: !!player.isHost };
      }

      emitSanitizedRoomUpdate(roomCode);
      socket.emit('room_messages', roomMessages[roomCode] || []);
    } else {
      socket.emit('error', 'Room not found.');
    }
  });

  socket.on('join_room', async ({ roomCode, playerName }) => {
    try {
      if (!roomCode || typeof roomCode !== 'string') {
        socket.emit('error', 'Invalid room code');
        return;
      }
      const cleanName = sanitizeName(playerName);
      const room = await getRoomData(roomCode);
      if (!room) {
        socket.emit('error', 'Room not found or could not be joined');
        return;
      }

      if (room.state !== 'LOBBY') {
        socket.emit('error', 'The duel has already started! You cannot join now.');
        return;
      }

      const updatedPlayers = [...(room.players || [])];
      if (!updatedPlayers.some(p => p.id === socket.id)) {
        updatedPlayers.push({ id: socket.id, name: cleanName, isHost: false, age: generateRandomAge() });
      }
      await updateRoomData(roomCode, { players: updatedPlayers, lastActivity: Date.now() });
      socketRooms[socket.id] = { roomCode, isHost: false };
      socket.join(roomCode);
      setupRoomListener(roomCode);
      socket.emit('room_joined', roomCode);
      sendSystemMessage(roomCode, `🤠 ${cleanName} rode into town and joined the posse.`);
    } catch (e) {
      console.error('Error joining room:', e.message);
      socket.emit('error', 'Room not found or could not be joined');
    }
  });

  // START GAME (HOST)
  socket.on('start_game', async ({ roomCode, numMafia, hasDoctor, hasSheriff, gameMode = 'online', hostPlays = true, dayDuration = 60, nightDuration = 45 }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room) return;
      if (!isSocketHost(room, socket.id)) {
        socket.emit('error', 'Unauthorized: Only the Warden can start the duel.');
        return;
      }
      if (room.state !== 'LOBBY') return;

      const { roles, players: assignedPlayers } = distributeRoles(
        room.players,
        numMafia,
        hasDoctor,
        hasSheriff,
        gameMode === 'online' ? hostPlays : false
      );

      const finalNightDuration = Number(nightDuration) || 45;

      const updates = {
        state: 'PLAYING_NIGHT',
        gameMode,
        hostPlays,
        dayDuration: Number(dayDuration) || 60,
        nightDuration: finalNightDuration,
        players: assignedPlayers,
        roles,
        eliminated: [],
        votes: {},
        runoffCandidates: [],
        nightActions: {
          mafiaNominations: {},
          donKill: null,
          doctorHeal: null,
          sheriffChecked: null
        },
        lastEliminated: null,
        phaseEndsAt: gameMode === 'online' ? Date.now() + finalNightDuration * 1000 : null,
        lastActivity: Date.now()
      };

      await updateRoomData(roomCode, updates);
      sendSystemMessage(roomCode, `⚔️ The duel has begun! Mode: ${gameMode.toUpperCase()}. The sun sets and night falls (${finalNightDuration}s)...`);

      if (gameMode === 'online') {
        startNightTimer(roomCode, finalNightDuration);
      }
    } catch (e) {
      console.error('Error starting game:', e.message);
    }
  });

  // ==========================================
  // NIGHT ACTION EVENTS (ONLINE MODE)
  // ==========================================

  // Mafia member nominates / offers target
  socket.on('mafia_nominate', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || room.state !== 'PLAYING_NIGHT') return;

      const role = (room.roles || {})[socket.id];
      if (role !== 'Mafia' && role !== 'Don') return;

      const player = (room.players || []).find(p => p.id === socket.id);
      const target = (room.players || []).find(p => p.id === targetId);
      if (!player || !target) return;
      if ((room.eliminated || []).includes(targetId)) return;

      const na = { ...(room.nightActions || {}) };
      na.mafiaNominations = { ...(na.mafiaNominations || {}) };
      na.mafiaNominations[socket.id] = targetId;

      await updateRoomData(roomCode, { nightActions: na, lastActivity: Date.now() });

      // Notify fellow Mafia members in Outlaw chat
      (room.players || []).forEach(p => {
        const pRole = (room.roles || {})[p.id];
        if (pRole === 'Mafia' || pRole === 'Don') {
          io.to(p.id).emit('mafia_nomination_update', { nominations: na.mafiaNominations });
        }
      });

      // Post proposal inside the Outlaw Hideout channel
      const msg = {
        id: `sys_nom_${Date.now()}`,
        senderId: 'system',
        senderName: 'OUTLAW COURIER',
        isSystem: true,
        text: `🎯 ${player.name} proposed targeting ${target.name}.`,
        channel: 'mafia',
        timestamp: Date.now()
      };
      (room.players || []).forEach(p => {
        const pRole = (room.roles || {})[p.id];
        if (pRole === 'Mafia' || pRole === 'Don') {
          io.to(p.id).emit('new_message', msg);
        }
      });
    } catch (e) {
      console.error('Error in mafia_nominate:', e.message);
    }
  });

  // Don finalizes the kill
  socket.on('don_kill', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || room.state !== 'PLAYING_NIGHT') return;

      const activeDon = getActiveDon(room);
      if (!activeDon || activeDon.id !== socket.id) {
        socket.emit('error', 'Only the Don of the Outlaws can order the execution!');
        return;
      }

      const target = (room.players || []).find(p => p.id === targetId);
      if (!target || (room.eliminated || []).includes(targetId)) return;

      // Don cannot kill fellow mafia
      const targetRole = (room.roles || {})[targetId];
      if (targetRole === 'Mafia' || targetRole === 'Don') {
        socket.emit('error', 'Honor among thieves! You cannot target a fellow Outlaw.');
        return;
      }

      // Check living mafia count
      const livingPlayers = getLivingPlayers(room);
      const livingMafia = livingPlayers.filter(p => {
        const r = (room.roles || {})[p.id];
        return r === 'Mafia' || r === 'Don';
      });

      const na = { ...(room.nightActions || {}) };
      const nominatedTargets = Object.values(na.mafiaNominations || {});

      // Rule: if 4 or more mafia, Don MUST pick someone nominated by the gang!
      if (livingMafia.length >= 4 && !nominatedTargets.includes(targetId)) {
        socket.emit('error', 'With 4 or more Outlaws in the gang, you must choose a target nominated by your members!');
        return;
      }

      na.donKill = targetId;
      await updateRoomData(roomCode, { nightActions: na, lastActivity: Date.now() });

      // Notify all Mafia in Outlaw chat
      const msg = {
        id: `sys_don_${Date.now()}`,
        senderId: 'system',
        senderName: 'OUTLAW COURIER',
        isSystem: true,
        text: `💀 Don ${activeDon.name} confirmed the hit on ${target.name}!`,
        channel: 'mafia',
        timestamp: Date.now()
      };
      (room.players || []).forEach(p => {
        const pRole = (room.roles || {})[p.id];
        if (pRole === 'Mafia' || pRole === 'Don') {
          io.to(p.id).emit('new_message', msg);
        }
      });

      // Check if night is complete
      await checkNightCompletion(roomCode);
    } catch (e) {
      console.error('Error in don_kill:', e.message);
    }
  });

  // Doctor heals / protects a target
  socket.on('doctor_heal', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || room.state !== 'PLAYING_NIGHT') return;

      const myRole = (room.roles || {})[socket.id];
      if (myRole !== 'Doctor') return;
      if ((room.eliminated || []).includes(socket.id)) return;

      const target = (room.players || []).find(p => p.id === targetId);
      if (!target || (room.eliminated || []).includes(targetId)) return;

      const na = { ...(room.nightActions || {}) };
      na.doctorHeal = targetId;

      await updateRoomData(roomCode, { nightActions: na, lastActivity: Date.now() });
      socket.emit('doctor_confirmed', { targetId, targetName: target.name });

      // Check if night is complete
      await checkNightCompletion(roomCode);
    } catch (e) {
      console.error('Error in doctor_heal:', e.message);
    }
  });

  // Sheriff investigates a suspect
  socket.on('sheriff_investigate', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || room.state !== 'PLAYING_NIGHT') return;

      const myRole = (room.roles || {})[socket.id];
      if (myRole !== 'Sheriff') return;
      if ((room.eliminated || []).includes(socket.id)) return;

      const target = (room.players || []).find(p => p.id === targetId);
      if (!target || targetId === socket.id) return;

      const targetRole = (room.roles || {})[targetId] || 'Citizen';
      const isOutlaw = targetRole === 'Mafia' || targetRole === 'Don';

      const na = { ...(room.nightActions || {}) };
      na.sheriffChecked = targetId;

      await updateRoomData(roomCode, { nightActions: na, lastActivity: Date.now() });

      // Send private forensic report strictly to Sheriff
      socket.emit('sheriff_result', {
        targetId,
        targetName: target.name,
        result: isOutlaw ? 'OUTLAW' : 'INNOCENT'
      });

      // Check if night is complete
      await checkNightCompletion(roomCode);
    } catch (e) {
      console.error('Error in sheriff_investigate:', e.message);
    }
  });

  // ==========================================
  // DAY VOTING & HOST CONTROLS
  // ==========================================

  socket.on('submit_vote', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || (room.state !== 'PLAYING_DAY_VOTE' && room.state !== 'PLAYING_DAY_RUNOFF')) return;

      const isOnline = room.gameMode !== 'offline';
      const voter = (room.players || []).find(p => p.id === socket.id);
      if (!voter) return;
      if (!isOnline && voter.isHost) return;
      if ((room.eliminated || []).includes(socket.id)) return;

      const target = (room.players || []).find(p => p.id === targetId);
      if (!target || (room.eliminated || []).includes(targetId)) return;

      // In run-off round, votes are restricted to tied suspects!
      if (room.state === 'PLAYING_DAY_RUNOFF') {
        const runoffCandidates = room.runoffCandidates || [];
        if (!runoffCandidates.includes(targetId)) {
          socket.emit('error', 'In the run-off round, you can only vote for the tied suspects!');
          return;
        }
      }

      const votes = { ...(room.votes || {}) };
      votes[socket.id] = targetId;

      await updateRoomData(roomCode, { votes, lastActivity: Date.now() });

      if (isOnline) {
        await checkAllVoted(roomCode);
      }
    } catch (e) {
      console.error('Error submitting vote:', e.message);
    }
  });

  // Manual host controls for offline mode
  socket.on('start_day_vote', async ({ roomCode }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || !isSocketHost(room, socket.id)) return;
      await updateRoomData(roomCode, { state: 'PLAYING_DAY_VOTE', votes: {}, lastActivity: Date.now() });
      sendSystemMessage(roomCode, `☀️ High Noon! Wake up, townspeople! Discuss and cast your accusations.`);
    } catch (e) {
      console.error('Error starting day vote:', e.message);
    }
  });

  socket.on('end_day_vote', async ({ roomCode }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || !isSocketHost(room, socket.id)) return;
      await resolveDayVote(roomCode);
    } catch (e) {
      console.error('Error ending day vote:', e.message);
    }
  });

  socket.on('start_night', async ({ roomCode }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || !isSocketHost(room, socket.id)) return;
      await startNightPhase(roomCode);
    } catch (e) {
      console.error('Error starting night:', e.message);
    }
  });

  socket.on('night_kill', async ({ roomCode, targetId }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room || !isSocketHost(room, socket.id)) return;
      const na = { ...(room.nightActions || {}) };
      na.donKill = targetId;
      await updateRoomData(roomCode, { nightActions: na });
      await resolveNight(roomCode);
    } catch (e) {
      console.error('Error in manual night kill:', e.message);
    }
  });

  // ==========================================
  // IN-GAME CHAT SYSTEM WITH DAY/NIGHT RULES
  // ==========================================

  socket.on('send_message', async ({ roomCode, text, channel = 'town' }) => {
    try {
      if (!roomCode || typeof text !== 'string') return;
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 300) return;

      const now = Date.now();
      const lastSent = chatRateLimits[socket.id] || 0;
      if (now - lastSent < 400) {
        socket.emit('chat_error', 'Hold your horses! You are sending telegrams too fast.');
        return;
      }
      chatRateLimits[socket.id] = now;

      const room = await getRoomData(roomCode);
      if (!room) return;

      const player = (room.players || []).find(p => p.id === socket.id);
      if (!player) return;

      const role = (room.roles || {})[socket.id] || 'Citizen';
      const isDead = (room.eliminated || []).includes(socket.id);
      const isHost = !!player.isHost;

      let targetChannel = channel;

      // Eliminated players during active game are routed to graveyard
      if (isDead && (room.state || '').startsWith('PLAYING_')) {
        targetChannel = 'dead';
      }

      // CRITICAL CHAT RULES:
      // 1. Daytime: Outlaw Hideout chat cannot be used!
      const isDay = room.state === 'PLAYING_DAY_VOTE' || room.state === 'PLAYING_DAY_RUNOFF' || room.state === 'PLAYING_DAY_RESULTS';
      if (targetChannel === 'mafia' && isDay) {
        socket.emit('chat_error', 'Outlaws cannot whisper in broad daylight! Speak in the Town Square.');
        return;
      }

      // 2. Mafia channel permission check
      if (targetChannel === 'mafia' && role !== 'Mafia' && role !== 'Don' && !isHost) {
        socket.emit('chat_error', 'Only Outlaws can access the hideout whisper.');
        return;
      }

      // 3. Nighttime: Town Square is muted for sleeping living players
      if (targetChannel === 'town' && room.state === 'PLAYING_NIGHT' && !isHost) {
        socket.emit('chat_error', 'The town is fast asleep. Keep silent until sunrise!');
        return;
      }

      const isDon = role === 'Don';
      const msg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: socket.id,
        senderName: player.name,
        role: isHost && room.gameMode === 'offline' ? 'Host' : (isDead ? 'Ghost' : (isDon ? 'Don' : role)),
        isHost,
        isDead,
        isDon,
        text: trimmed,
        channel: targetChannel,
        timestamp: Date.now()
      };

      if (!roomMessages[roomCode]) roomMessages[roomCode] = [];
      roomMessages[roomCode].push(msg);
      if (roomMessages[roomCode].length > 150) roomMessages[roomCode].shift();

      if (targetChannel === 'town') {
        io.to(roomCode).emit('new_message', msg);
      } else if (targetChannel === 'mafia') {
        (room.players || []).forEach(p => {
          const pRole = (room.roles || {})[p.id];
          if (pRole === 'Mafia' || pRole === 'Don' || (room.gameMode === 'offline' && p.isHost)) {
            io.to(p.id).emit('new_message', msg);
          }
        });
      } else if (targetChannel === 'dead') {
        (room.players || []).forEach(p => {
          const pDead = (room.eliminated || []).includes(p.id);
          if (pDead || (room.gameMode === 'offline' && p.isHost)) {
            io.to(p.id).emit('new_message', msg);
          }
        });
      }
    } catch (err) {
      console.error('Error handling send_message:', err);
    }
  });

  socket.on('get_room_messages', ({ roomCode }) => {
    if (roomCode && roomMessages[roomCode]) {
      socket.emit('room_messages', roomMessages[roomCode]);
    }
  });

  socket.on('restart_game', async ({ roomCode }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room) return;
      if (!isSocketHost(room, socket.id)) return;

      if (dayTimers[roomCode]) clearTimeout(dayTimers[roomCode]);
      if (nightTimers[roomCode]) clearTimeout(nightTimers[roomCode]);
      delete dayTimers[roomCode];
      delete nightTimers[roomCode];

      await updateRoomData(roomCode, {
        state: 'LOBBY',
        roles: {},
        eliminated: [],
        votes: {},
        nightActions: {
          mafiaNominations: {},
          donKill: null,
          doctorHeal: null,
          sheriffChecked: null
        },
        lastEliminated: null,
        phaseEndsAt: null,
        lastActivity: Date.now()
      });
      roomMessages[roomCode] = [];
      sendSystemMessage(roomCode, `🔄 The duel has restarted! Posse assembled in the lobby.`);
    } catch (e) {
      console.error('Error restarting game:', e.message);
    }
  });

  socket.on('ping_activity', async ({ roomCode }) => {
    try {
      if (!roomCode) return;
      await updateRoomData(roomCode, { lastActivity: Date.now() });
    } catch (e) { }
  });

  socket.on('destroy_room', async ({ roomCode }) => {
    try {
      const room = await getRoomData(roomCode);
      if (!room) return;
      if (!isSocketHost(room, socket.id)) return;

      console.log(`[DESTROY] Host destroyed room: ${roomCode}`);
      io.to(roomCode).emit('host_disconnected');
      await deleteRoomData(roomCode);
    } catch (e) {
      console.error('Error destroying room:', e);
    }
  });

  socket.on('disconnect', async () => {
    delete chatRateLimits[socket.id];
    const info = socketRooms[socket.id];
    if (info) {
      if (info.isHost) {
        console.log(`[HOST DISCONNECT] Host disconnected from room ${info.roomCode}. Waiting 30s grace period before disbanding...`);
        if (hostDisconnectTimers[info.roomCode]) {
          clearTimeout(hostDisconnectTimers[info.roomCode]);
        }
        hostDisconnectTimers[info.roomCode] = setTimeout(async () => {
          console.log(`[DISBAND] Host did not reconnect to room ${info.roomCode}. Disbanding room.`);
          io.to(info.roomCode).emit('host_disconnected');
          delete hostDisconnectTimers[info.roomCode];
          await deleteRoomData(info.roomCode);
        }, 30000);
      } else {
        try {
          const room = await getRoomData(info.roomCode);
          if (room && room.state === 'LOBBY') {
            const leavingPlayer = (room.players || []).find(p => p.id === socket.id);
            const updatedPlayers = (room.players || []).filter(p => p.id !== socket.id);
            await updateRoomData(info.roomCode, { players: updatedPlayers });
            console.log(`Player ${socket.id} removed from room ${info.roomCode} due to disconnect.`);
            if (leavingPlayer) {
              sendSystemMessage(info.roomCode, `💨 ${leavingPlayer.name} has left the town.`);
            }
          }
        } catch (e) {
          console.error('Error removing player on disconnect:', e.message);
        }
      }
      delete socketRooms[socket.id];
    }
  });
});

// SPA fallback for React Router in production
if (fs.existsSync(distPath)) {
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mafia server running securely on port ${PORT}`);
});
