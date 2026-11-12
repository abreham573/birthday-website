import React, { useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';

interface HeartParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: number;
  speed: number;
  text?: string;
}

const SWEET_WHISPERS = [
  'I love you Tsi ❤️',
  'Happy Birthday my queen 👑',
  'You are all I ever need 🎶',
  'My whole heart 💕',
  'Forever & always ✨',
  'You make my world glow 🌹',
  'Only you, Tsi 💖',
  'Angel in my life 🕊️',
];

const HEART_COLORS = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#e11d48'];

export const useHeartTapEffect = () => {
  const [particles, setParticles] = useState<HeartParticle[]>([]);
  const [tapCount, setTapCount] = useState<number>(() => {
    const saved = localStorage.getItem('tsi_heart_taps');
    return saved ? parseInt(saved, 10) : 0;
  });

  const triggerHeartBurst = useCallback((clientX: number, clientY: number, customText?: string) => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    try {
      localStorage.setItem('tsi_heart_taps', newCount.toString());
    } catch {
      // storage unavailable
    }

    // Trigger sweet confetti burst every 7 taps
    if (newCount % 7 === 0) {
      confetti({
        particleCount: 25,
        spread: 60,
        origin: {
          x: clientX / window.innerWidth,
          y: clientY / window.innerHeight,
        },
        colors: ['#e11d48', '#fb7185', '#ffe4e6', '#ffd700'],
        shapes: ['circle'],
        ticks: 200,
      });
    }

    const newParticles: HeartParticle[] = [];
    // Spawn 5 to 8 micro hearts
    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 2.5;
      const size = 14 + Math.random() * 12;
      const color = HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
      
      newParticles.push({
        id: Date.now() + Math.random() + i,
        x: clientX,
        y: clientY,
        size,
        color,
        angle,
        speed,
        // Only one particle in the burst gets the sweet text note
        text: i === 0 ? (customText || SWEET_WHISPERS[Math.floor(Math.random() * SWEET_WHISPERS.length)]) : undefined,
      });
    }

    setParticles((prev) => [...prev.slice(-30), ...newParticles]);
  }, [tapCount]);

  // Clean up particles after animation completes
  useEffect(() => {
    if (particles.length === 0) return;
    const timer = setTimeout(() => {
      setParticles([]);
    }, 1800);
    return () => clearTimeout(timer);
  }, [particles]);

  const renderFloatingHearts = () => {
    return (
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
        {particles.map((p) => {
          const moveX = Math.cos(p.angle) * p.speed * 20;
          const moveY = -60 - Math.random() * 50;

          return (
            <div
              key={p.id}
              className="absolute select-none pointer-events-none"
              style={{
                left: `${p.x}px`,
                top: `${p.y}px`,
                animation: 'floatAndFade 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                transformOrigin: 'center center',
              }}
            >
              <div className="relative flex flex-col items-center">
                {/* Heart SVG */}
                <svg
                  width={p.size}
                  height={p.size}
                  viewBox="0 0 24 24"
                  fill={p.color}
                  stroke={p.color}
                  strokeWidth="1"
                  className="filter drop-shadow-[0_2px_8px_rgba(225,29,72,0.6)]"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>

                {/* Sweet whisper text if attached */}
                {p.text && (
                  <span
                    className="mt-1 px-2.5 py-1 text-[11px] font-medium text-rose-100 bg-rose-950/90 rounded-full border border-rose-400/30 whitespace-nowrap shadow-lg backdrop-blur-md"
                    style={{
                      transform: 'translateY(-10px)',
                    }}
                  >
                    {p.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <style>{`
          @keyframes floatAndFade {
            0% {
              transform: translate(-50%, -50%) scale(0.4) rotate(0deg);
              opacity: 1;
            }
            30% {
              transform: translate(calc(-50% + var(--dx, 0px)), -40px) scale(1.15) rotate(5deg);
              opacity: 1;
            }
            100% {
              transform: translate(calc(-50% + var(--dx, 0px)), -110px) scale(0.9) rotate(-10deg);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    );
  };

  return {
    triggerHeartBurst,
    tapCount,
    renderFloatingHearts,
  };
};
