import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Room from './components/Room';
import InactivityTimer from './components/InactivityTimer';
import SnakeGame from './components/SnakeGame';
import WesternBackdrop from './components/WesternBackdrop';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <WesternBackdrop />
      <InactivityTimer />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:inviteCode" element={<Home />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="/mini-game" element={<SnakeGame />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
