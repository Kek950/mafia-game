import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../socket';

const INACTIVITY_TIME = 10 * 60 * 1000; // 10 minutes
const WARNING_TIME = 9 * 60 * 1000; // 9 minutes (1 minute left)

export default function InactivityTimer() {
  const location = useLocation();
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const warningRef = useRef(null);
  const lastResetRef = useRef(Date.now());
  const lastPingRef = useRef(0);
  const logIntervalRef = useRef(null);

  // Extract room code from URL
  const roomMatch = location.pathname.match(/\/room\/([^\/]+)/);
  const roomCode = roomMatch ? roomMatch[1] : null;

  const resetTimer = (serverTimestamp = null) => {
    const now = Date.now();
    const baseTime = serverTimestamp || now;
    
    // Update the visual reference for the log interval
    lastResetRef.current = baseTime;

    // Clear existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // If we're not in a room, we don't start the timer logic
    if (!roomCode) return;

    const timeSinceLastActivity = now - baseTime;
    const timeUntilWarning = Math.max(0, WARNING_TIME - timeSinceLastActivity);
    const timeUntilDisband = Math.max(0, INACTIVITY_TIME - timeSinceLastActivity);



    // Set warning timer
    warningRef.current = setTimeout(() => {
      alert("ATTENTION PARTNER: You've been idle for too long! 1 minute until this posse is disbanded.");
    }, timeUntilWarning);

    // Set expiration timer
    timerRef.current = setTimeout(() => {
      console.log(`Timer expired for room ${roomCode}. Sending destroy_room...`);
      if (roomCode) {
        socket.emit('destroy_room', { roomCode });
      }
      navigate('/');
      alert("This town wasn't big enough for your silence. Room disbanded due to inactivity.");
    }, timeUntilDisband);
  };

  const handleInteraction = () => {
    if (!roomCode) return;

    const now = Date.now();
    // Throttle emits to every 30 seconds to save on Firestore writes
    if (now - lastPingRef.current > 30000) {
      lastPingRef.current = now;
      socket.emit('ping_activity', { roomCode });

    }
  };

  useEffect(() => {
    if (!roomCode) return;

    // Listen for room updates to sync lastActivity from Firestore
    const onRoomUpdate = (room) => {
      if (room.lastActivity) {
        resetTimer(room.lastActivity);
      }
    };

    socket.on('room_update', onRoomUpdate);
    
    // Listen for interactions on window
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    
    // Initial sync
    resetTimer();

    // Log remaining time every 10 seconds
    logIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastResetRef.current;
      const remaining = Math.max(0, INACTIVITY_TIME - elapsed);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      console.log(`⏳ Time until disbandment: ${minutes}m ${seconds}s`);
    }, 10000);

    return () => {
      socket.off('room_update', onRoomUpdate);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    };
  }, [roomCode]); // Re-initialize only when room code changes

  return null;
}
