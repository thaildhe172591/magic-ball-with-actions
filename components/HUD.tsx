
import React from 'react';
import { HandGesture, HandData } from '../types';

interface HUDProps {
  handData: HandData;
}

const HUD: React.FC<HUDProps> = ({ handData }) => {
  
  // Visual metrics
  const pressure = Math.round(handData.gripStrength * 100);
  const stability = Math.max(0, 100 - (handData.handSeparation * 100));
  const energyLevel = Math.min(100, Math.round((handData.gripStrength * 0.5 + handData.handSeparation * 0.5) * 100) + 10);
  
  const getStatusText = () => {
      if (handData.handSeparation > 0.3) return 'FIELD DIVERGENCE';
      if (handData.gripStrength > 0.6) return 'CRITICAL COMPRESSION';
      if (handData.isPresent) return 'SUBJECT TRACKED';
      return 'SCANNING...';
  };

  const getStatusColor = () => {
    if (handData.handSeparation > 0.3) return 'text-red-400';
    if (handData.gripStrength > 0.6) return 'text-orange-400';
    return 'text-cyan-400';
  };

  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-20 font-mono select-none">
      
      {/* Top Header */}
      <div className="flex justify-between items-start">
        <div className="bg-black/20 backdrop-blur-sm p-2 border-l-2 border-cyan-500">
            <div className="text-[10px] text-cyan-500/80 tracking-[0.3em]">OPERATING SYSTEM</div>
            <h1 className="text-xl font-bold text-cyan-100 tracking-widest jarvis-glow">A.R.C. REACTOR</h1>
        </div>
        <div className="text-right opacity-80">
             <div className="text-[10px] text-cyan-500 tracking-[0.3em]">LIVE FEED</div>
             <div className="flex items-center justify-end gap-2">
                 <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                 <span className="text-cyan-300 font-bold">REC</span>
             </div>
        </div>
      </div>

      {/* Central Reticle (Only when hand is lost) */}
      {!handData.isPresent && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20">
             <div className="w-[200px] h-[200px] border border-cyan-500/40 rounded-full flex items-center justify-center animate-pulse">
                <div className="w-1 h-1 bg-cyan-500 rounded-full"></div>
             </div>
         </div>
      )}

      {/* Bottom Telemetry */}
      <div className="grid grid-cols-3 gap-4 items-end">
        
        {/* Left: Compression / Pressure */}
        <div className="bg-black/50 backdrop-blur border-t border-cyan-500/30 p-4">
            <div className="flex justify-between text-xs text-cyan-400 mb-2">
                <span>CHAMBER PRESSURE</span>
                <span>{pressure} PSI</span>
            </div>
            <div className="w-full h-1 bg-gray-800 mb-4">
                <div 
                    className="h-full bg-orange-400 transition-all duration-100 ease-linear" 
                    style={{ width: `${pressure}%` }}
                />
            </div>
            <div className="text-[9px] text-cyan-500/60">
                COMPRESSION RATIO: {(1 + handData.gripStrength).toFixed(2)}:1
            </div>
        </div>

        {/* Center: Status */}
        <div className="text-center mb-6">
            <div className={`inline-block px-6 py-2 border rounded backdrop-blur-md transition-all duration-300 ${getStatusColor()} border-current bg-black/40`}>
                <span className="text-sm tracking-[0.2em] font-bold animate-pulse">
                    {getStatusText()}
                </span>
            </div>
        </div>

        {/* Right: Output / Stability */}
        <div className="bg-black/50 backdrop-blur border-t border-cyan-500/30 p-4 text-right">
             <div className="flex justify-between text-xs text-cyan-400 mb-2">
                 <span>ENERGY OUTPUT</span>
                 <span>{energyLevel} GW</span>
             </div>
             <div className="w-full h-1 bg-gray-800 mb-4 flex justify-end">
                <div 
                    className="h-full bg-cyan-400 transition-all duration-100 ease-linear shadow-[0_0_10px_cyan]" 
                    style={{ width: `${energyLevel}%` }}
                />
            </div>
             <div className="text-[9px] text-cyan-500/60">
                 FIELD STABILITY: {stability.toFixed(0)}%
             </div>
        </div>

      </div>
    </div>
  );
};

export default HUD;
