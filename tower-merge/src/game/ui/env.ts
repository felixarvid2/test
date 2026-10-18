/** Tiny bridge to services (sfx + settings) that never throws: the kit works without them. */
import { services } from '../../services';
import type { SfxKey } from '../../audio/keys';

export function playSfx(key: SfxKey): void {
  try {
    services.audio.play(key);
  } catch {
    /* audio is optional */
  }
}

export function reducedMotion(): boolean {
  try {
    return services.save.data.settings.reducedMotion === true;
  } catch {
    return false;
  }
}
