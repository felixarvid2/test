import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import type { ClaimContext } from '../../rewards/RewardService';
import type { RewardPlacement } from '../../rewards/types';
import { Button, H, W, label, panel, popIn, toast } from './kit';

export interface RewardOffer {
  title: string;
  desc: string;
  icon: string;          // ICONS key
  depth?: number;
}

/** True when the reward can be offered at all right now (ad available or a token to spend). */
export function canOfferReward(placement: RewardPlacement, ctx: ClaimContext): boolean {
  return services.rewards.gate(placement, ctx) !== 'none';
}

/** Text for a button that unlocks a reward, or null when the reward cannot be offered. */
export function rewardButtonText(placement: RewardPlacement, ctx: ClaimContext): string | null {
  const gate = services.rewards.gate(placement, ctx);
  if (gate === 'ad') return '▶ Watch ad';
  if (gate === 'token') return `Use token (${services.rewards.tokens})`;
  return null;
}

/**
 * Runs a claim and shows the outcome. Resolves true only when the reward was verified and recorded;
 * the caller grants the reward after that and never before.
 */
export async function claimReward(scene: Phaser.Scene, placement: RewardPlacement, ctx: ClaimContext): Promise<boolean> {
  const result = await services.rewards.claim(placement, ctx);
  if (!scene.sys.isActive() && !scene.sys.isPaused()) return result.ok;
  if (result.ok) {
    services.audio.play('revive');
    return true;
  }
  const msg: Record<string, string> = {
    cancelled: 'Ad closed – no reward',
    failed: 'Ad unavailable right now',
    dailyLimit: 'Daily reward limit reached',
    alreadyClaimed: 'Already claimed',
    unavailable: 'Not available',
    invalid: 'Could not verify reward',
  };
  services.audio.play('error');
  toast(scene, msg[result.reason] ?? 'Not available', COLORS.textDim, H * 0.3);
  return false;
}

/**
 * Modal offer drawn inside `scene`: icon, title, description, an unlock button and "No thanks".
 * Resolves true when the reward was claimed. Resolves false at once (showing nothing) when the
 * reward is not available, so unavailable options are never shown.
 */
export function offerReward(scene: Phaser.Scene, placement: RewardPlacement, ctx: ClaimContext, offer: RewardOffer): Promise<boolean> {
  const text = rewardButtonText(placement, ctx);
  if (!text) return Promise.resolve(false);
  return new Promise((resolve) => {
    const depth = offer.depth ?? 5000;
    const layer = scene.add.container(0, 0).setDepth(depth);
    const shade = scene.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.75).setInteractive();
    const box = panel(scene, W / 2, H / 2, 600, 560, COLORS.panel, COLORS.legendary);
    const icon = scene.add.image(W / 2, H / 2 - 170, ICONS_KEY, offer.icon).setScale(5);
    const title = label(scene, W / 2, H / 2 - 80, offer.title, 52, COLORS.gold);
    const desc = label(scene, W / 2, H / 2 - 10, offer.desc, 34, COLORS.text, { wordWrap: { width: 520 } });
    let busy = false;
    const finish = (ok: boolean) => {
      layer.destroy();
      resolve(ok);
    };
    const claim = new Button(scene, W / 2, H / 2 + 110, text, async () => {
      if (busy) return;
      busy = true;
      claim.setEnabled(false);
      no.setEnabled(false);
      const ok = await claimReward(scene, placement, ctx);
      finish(ok);
    }, { width: 440, color: 0x2f8f4e });
    const no = new Button(scene, W / 2, H / 2 + 220, 'No thanks', () => { if (!busy) finish(false); }, { width: 440, color: 0x5a4a62 });
    layer.add([shade, box, icon, title, desc, claim, no]);
    popIn(scene, icon);
  });
}
