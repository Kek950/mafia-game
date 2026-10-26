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
  const lastTouchTime = useRef(0);
  const lastRandomTargetTime = useRef(0);
  const nextTargetInterval = useRef(3500);

  useEffect(() => {
    const isMobilePhone = () => {
      if (typeof window === 'undefined') return false;
      return (
        window.innerWidth <= 820 ||
        'ontouchstart' in window ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches
      );
    };

    const pickNewRandomWaypoint = () => {
      const width = window.innerWidth || 360;
      const height = window.innerHeight || 640;
      // Keep light roaming within 18% to 82% of screen
      const minX = width * 0.18;
      const maxX = width * 0.82;
      const minY = height * 0.18;
      const maxY = height * 0.82;

      targetPos.current = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY)
      };
      // Random interval between 3.5s and 6.5s for unpredictable organic drifting
      nextTargetInterval.current = 3500 + Math.random() * 3000;
      lastRandomTargetTime.current = performance.now();
    };

    // Initialize first random waypoint for mobile
    if (isMobilePhone()) {
      pickNewRandomWaypoint();
    }

    const handleMouseMove = (e) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouch = (e) => {
      if (e.touches && e.touches.length > 0) {
        lastTouchTime.current = performance.now();
        targetPos.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        };
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('touchmove', handleTouch, { passive: true });

    // Smooth physics lerp loop (damping for natural lantern sway)
    const updateLantern = (now) => {
      const onPhone = isMobilePhone();

      // On phones, if user hasn't touched the screen in 2.5s, pick new random waypoints
      if (onPhone) {
        const timeSinceTouch = now - lastTouchTime.current;
        if (timeSinceTouch > 2500) {
          if (now - lastRandomTargetTime.current > nextTargetInterval.current) {
            pickNewRandomWaypoint();
          }
        }
      }

      // Natural harmonic lantern sway (like a swinging kerosene lantern in a saloon)
      const swayX = Math.sin(now * 0.0016) * 18 + Math.cos(now * 0.0029) * 10;
      const swayY = Math.cos(now * 0.0014) * 16 + Math.sin(now * 0.0024) * 8;

      // Silky damping: 0.028 on mobile for gentle cinematic drift, 0.075 on desktop
      const damping = onPhone ? 0.028 : 0.075;
      const effectiveTargetX = targetPos.current.x + (onPhone ? swayX : 0);
      const effectiveTargetY = targetPos.current.y + (onPhone ? swayY : 0);

      currentPos.current.x += (effectiveTargetX - currentPos.current.x) * damping;
      currentPos.current.y += (effectiveTargetY - currentPos.current.y) * damping;

      if (lanternRef.current) {
        lanternRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
      }

      rafId.current = requestAnimationFrame(updateLantern);
    };

    rafId.current = requestAnimationFrame(updateLantern);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('touchmove', handleTouch);
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
