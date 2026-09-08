import type { World } from './types';

/** Sequential, seed-stable ids. Prefix identifies the entity kind. */
export function nextId(world: Pick<World, 'counters'>, prefix: string): string {
  const n = (world.counters[prefix] ?? 0) + 1;
  world.counters[prefix] = n;
  return `${prefix}_${n.toString(36)}`;
}
