import { EXTRA_KEY, TILES_KEY, TILE_FRAMES } from '../assets';

// Data files reference sprites as 'tile:knight' (spritesheet index) or 'extra:skeleton' (atlas frame).

export interface FrameRef {
  key: string;
  frame: string | number;
}

const cache = new Map<string, FrameRef>();

export function frameRef(spec: string): FrameRef {
  let ref = cache.get(spec);
  if (!ref) {
    const idx = spec.indexOf(':');
    const kind = spec.slice(0, idx);
    const name = spec.slice(idx + 1);
    ref = kind === 'tile'
      ? { key: TILES_KEY, frame: TILE_FRAMES[name as keyof typeof TILE_FRAMES] ?? 0 }
      : { key: EXTRA_KEY, frame: name };
    cache.set(spec, ref);
  }
  return ref;
}
