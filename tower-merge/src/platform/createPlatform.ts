import { BrowserPlatform } from './BrowserPlatform';
import type { Platform } from './Platform';
import { YouTubePlatform } from './YouTubePlatform';

/** YouTube Playables when the SDK reports it, otherwise the plain-browser host. */
export function createPlatform(): Platform {
  const inPlayables = typeof window !== 'undefined' && window.ytgame?.IN_PLAYABLES_ENV === true;
  return inPlayables ? new YouTubePlatform() : new BrowserPlatform();
}
