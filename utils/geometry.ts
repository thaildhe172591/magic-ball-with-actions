import { Point, Vector } from '../types';

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const normalize = (v: Vector): Vector => {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
};

export const randomRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

export const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
  return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
};
