import { CLUES } from '../data/stage01';
import type { Clue, Collider } from './types';

export const PLAYER_RADIUS = 0.27;

export function walkable(x: number, z: number, colliders: Collider[]): boolean {
  // A continuous union of the room and hallway keeps the doorway traversable.
  const office = x >= -5.7 && x <= 5.7 && z >= -4.2 && z <= 4.2;
  const hall = x >= 5.7 && x <= 8.7 && z >= -0.2 && z <= 4.2;
  if (!office && !hall) return false;
  return !colliders.some(c => x > c.minX - PLAYER_RADIUS && x < c.maxX + PLAYER_RADIUS && z > c.minZ - PLAYER_RADIUS && z < c.maxZ + PLAYER_RADIUS);
}

export function moveWithCollision(x: number, z: number, dx: number, dz: number, colliders: Collider[]) {
  // Split long moves to avoid tunnelling even after a slow frame.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < steps; i++) {
    if (walkable(x + dx / steps, z, colliders)) x += dx / steps;
    if (walkable(x, z + dz / steps, colliders)) z += dz / steps;
  }
  return { x, z };
}

export function nearestClue(x: number, z: number, clues: Clue[] = CLUES): string | null {
  let nearest: string | null = null;
  let distance = Infinity;
  for (const clue of clues) {
    const d = Math.hypot(x - clue.x, z - clue.z);
    if (d <= clue.radius && d < distance) { nearest = clue.id; distance = d; }
  }
  return nearest;
}
