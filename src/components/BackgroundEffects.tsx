import React, { useMemo } from 'react';

export const BackgroundEffects: React.FC = () => {
  // Generate random petals with varied positions and drift animations
  const petals = useMemo(() => {
    return Array.from({ length: 16 }).map((_, i) => ({
      id: i,
      left: `${(i * 6.25 + (i % 3) * 2) % 100}%`,
      delay: `${(i * 1.3) % 8}s`,
      duration: `${12 + (i % 7) * 2}s`,
      size: `${12 + (i % 4) * 4}px`,
      opacity: 0.15 + (i % 4) * 0.08,
      rotation: `${(i * 45) % 360}deg`,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Deep Reddish Romantic Atmospheric Gradients */}
      <div 
        className="absolute inset-0 bg-[#0d0103]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 0%, #4a0410 0%, transparent 60%),
            radial-gradient(circle at 85% 40%, #580616 0%, transparent 50%),
            radial-gradient(circle at 15% 75%, #3d020c 0%, transparent 55%),
            radial-gradient(circle at 50% 100%, #220106 0%, #0d0103 100%)
          `,
        }}
      />

      {/* Subtle warm ember / sparkle glow spots */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-rose-600/10 rounded-full blur-[100px] animate-pulse-gentle" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-red-700/10 rounded-full blur-[90px] animate-pulse-gentle" style={{ animationDelay: '2s' }} />

      {/* Floating Rose Petals / Hearts */}
      {petals.map((petal) => (
        <span
          key={petal.id}
          className="absolute block select-none text-rose-400/40"
          style={{
            left: petal.left,
            top: '-5%',
            fontSize: petal.size,
            opacity: petal.opacity,
            animation: `petalDrift ${petal.duration} linear infinite`,
            animationDelay: petal.delay,
            transform: `rotate(${petal.rotation})`,
          }}
        >
          {petal.id % 3 === 0 ? '🌸' : petal.id % 2 === 0 ? '✨' : '🌹'}
        </span>
      ))}

      <style>{`
        @keyframes petalDrift {
          0% {
            transform: translateY(-50px) rotate(0deg) translateX(0px);
            opacity: 0;
          }
          10% {
            opacity: 0.4;
          }
          90% {
            opacity: 0.4;
          }
          100% {
            transform: translateY(115vh) rotate(360deg) translateX(50px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
