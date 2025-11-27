
export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Vector {
  x: number;
  y: number;
  z?: number;
}

export enum HandGesture {
  NONE = 'NONE',
  GRIP = 'GRIP', // Holding/Compressing
  HOVER = 'HOVER', // Hand present but open
  SPLIT = 'SPLIT' // Dual hand separation
}

export interface HandData {
  gesture: HandGesture;
  position: Point; // Screen normalized 0-1
  worldPosition: Vector; // 3D World Coords
  isPresent: boolean;
  trackingMode: 'SINGLE' | 'DUAL' | 'NONE';
  
  // Analog Physics Metrics
  handSeparation: number; // 0.0 to 1.0 (Distance between hands)
  gripStrength: number; // 0.0 (Open) to 1.0 (Closed Fist) - Drives Compression
  energyOutput: number; // 0.0 to 1.0 - Derived from grip tightness and movement
}
