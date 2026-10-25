import React, { useEffect, useRef } from 'react';
import darkWoodPhoto from '../assets/dark-wood.png';

export default function WesternBackdrop() {
  const lanternRef = useRef(null);
  const targetPos = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 400
  });
  const currentPos = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 400
  });
  const rafId = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Smooth physics lerp loop (damping for natural lantern sway)
    const updateLantern = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.075;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.075;

      if (lanternRef.current) {
        lanternRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
      }

      rafId.current = requestAnimationFrame(updateLantern);
    };

    rafId.current = requestAnimationFrame(updateLantern);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div className="western-backdrop" aria-hidden="true">
      {/* 1. Rock-solid steady Dark Wood photo base from GitHub */}
      <div 
        className="wood-static-base"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42)), url(${darkWoodPhoto})`
        }}
      />

      {/* 2. Interactive Kerosene Lantern Glow (Softly follows cursor with organic sway) */}
      <div ref={lanternRef} className="interactive-lantern-glow" />

      {/* 3. Deep perimeter vignette to ensure maximum text and card contrast */}
      <div className="saloon-vignette-overlay" />
    </div>
  );
}
