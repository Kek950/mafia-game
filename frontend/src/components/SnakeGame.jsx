import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: -1 };
const SPEED = 150;

export default function SnakeGame() {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  
  const navigate = useNavigate();
  const gameContainerRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });

  const getRandomFood = useCallback(() => {
    return {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  }, []);

  const resetGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setScore(0);
    setIsGameOver(false);
    setFood(getRandomFood());
    setIsStarted(true);
  };

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e) => {
    if (!isStarted || isGameOver) return;
    
    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };

    const dx = touchEnd.x - touchStartRef.current.x;
    const dy = touchEnd.y - touchStartRef.current.y;

    // Minimum swipe distance to trigger movement
    const minSwipe = 30;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (Math.abs(dx) > minSwipe) {
        if (dx > 0 && direction.x === 0) setDirection({ x: 1, y: 0 });
        else if (dx < 0 && direction.x === 0) setDirection({ x: -1, y: 0 });
      }
    } else {
      // Vertical swipe
      if (Math.abs(dy) > minSwipe) {
        if (dy > 0 && direction.y === 0) setDirection({ x: 0, y: 1 });
        else if (dy < 0 && direction.y === 0) setDirection({ x: 0, y: -1 });
      }
    }
  };

  useEffect(() => {
    if (!isStarted || isGameOver) return;

    const moveSnake = () => {
      const newHead = {
        x: (snake[0].x + direction.x + GRID_SIZE) % GRID_SIZE,
        y: (snake[0].y + direction.y + GRID_SIZE) % GRID_SIZE,
      };

      // Check collision with self
      if (snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        setIsGameOver(true);
        return;
      }

      const newSnake = [newHead, ...snake];

      // Check food
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(s => s + 10);
        setFood(getRandomFood());
      } else {
        newSnake.pop();
      }

      setSnake(newSnake);
    };

    const interval = setInterval(moveSnake, SPEED);
    return () => clearInterval(interval);
  }, [snake, direction, food, isGameOver, isStarted, getRandomFood]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Prevent scrolling while playing
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      
      switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) setDirection({ x: 0, y: -1 }); break;
        case 'ArrowDown': if (direction.y === 0) setDirection({ x: 0, y: 1 }); break;
        case 'ArrowLeft': if (direction.x === 0) setDirection({ x: -1, y: 0 }); break;
        case 'ArrowRight': if (direction.x === 0) setDirection({ x: 1, y: 0 }); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [direction]);

  useEffect(() => {
    // Connect socket if needed
    if (!socket.connected) socket.connect();

    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');

    const onRoomUpdate = (room) => {
      // If game state is no longer LOBBY, navigate back to the room
      if (room && room.state !== 'LOBBY') {
        navigate(`/room/${code}`);
      }
    };

    socket.on('room_update', onRoomUpdate);
    
    if (code) {
      socket.emit('get_room', { roomCode: code });
    }

    return () => {
      socket.off('room_update', onRoomUpdate);
    };
  }, [navigate]);

  return (
    <div 
      className="landing-container" 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ 
        height: '100vh', 
        width: '100vw', 
        overflow: 'hidden', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        position: 'fixed',
        top: 0,
        left: 0,
        background: 'var(--bg-color)',
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("https://www.transparenttextures.com/patterns/dark-wood.png")',
        touchAction: 'none' // Critical: stops the page from bouncing/scrolling during swipes
      }}
    >
      <div className="wanted-poster" style={{ 
        padding: 'min(2rem, 5vw)', 
        transform: 'none', 
        width: 'min(450px, 90%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}>
        <h3 className="snake-title" style={{ 
          fontFamily: 'Rye', 
          color: 'var(--accent-red)', 
          lineHeight: '1.2'
        }}>🐍 RATTLESNAKE RUSH</h3>
        <p className="snake-subtitle" style={{ 
          marginBottom: '1.5rem', 
          fontFamily: 'Special Elite' 
        }}>Don't get bit while the posse assembles!</p>
        
        {!isStarted ? (
          <button className="btn" style={{ maxWidth: '300px' }} onClick={resetGame}>START MINI-GAME</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div className="snake-grid" style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              width: 'min(320px, 75vw)',
              height: 'min(320px, 75vw)',
              margin: '0 auto',
              background: 'var(--wood-dark)',
              border: '6px solid var(--text-dark)',
              position: 'relative',
              boxShadow: '0 0 20px rgba(0,0,0,0.4)'
            }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE;
                const y = Math.floor(i / GRID_SIZE);
                const isSnake = snake.some(s => s.x === x && s.y === y);
                const isFood = food.x === x && food.y === y;
                
                return (
                  <div key={i} style={{
                    background: isSnake ? 'var(--accent-gold)' : isFood ? 'var(--accent-red)' : 'transparent',
                    border: '0.1px solid rgba(255,255,255,0.03)'
                  }} />
                );
              })}
              
              {isGameOver && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.85)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  zIndex: 10
                }}>
                  <h2 style={{ color: 'white', fontFamily: 'Rye', fontSize: '2.5rem' }}>BITTEN!</h2>
                  <p style={{ color: 'white', fontFamily: 'Special Elite' }}>Score: {score}</p>
                  <button className="btn" style={{ width: 'auto', marginTop: '1.5rem', padding: '0.8rem 2rem' }} onClick={resetGame}>RELOAD</button>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 'min(320px, 75vw)', marginTop: '1rem', alignItems: 'center' }}>
               <p style={{ fontFamily: 'Special Elite', fontSize: '1.2rem', margin: 0 }}>Mice: {score / 10}</p>
               <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => {
                 const code = new URLSearchParams(window.location.search).get('room');
                 navigate(`/room/${code}`);
               }}>EXIT TO LOBBY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
