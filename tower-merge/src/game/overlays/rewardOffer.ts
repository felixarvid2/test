/**
 * Reusable reward button. Shows "Watch ad" (with an ad icon) or "N gems" (gem icon) from
 * rewards.quote(), hides itself when the gate is 'none' or the reward was claimed, disables itself
 * while a claim is pending and toasts on cancelled/failed. It never grants anything itself: the
 * scene's onGranted runs only after claim() returned ok.
 */
import Phaser from 'phaser';
import { services } from '../../services';
import type { ClaimContext, ClaimResult, RewardPlacement } from '../../rewards/types';
import { RewardOfferState } from './logic';
import { ensureOverlayTextures } from './overlayKit';
import { DEPTH, createButton, showToast, type ButtonStyleName, type UIButton } from '../ui';

export interface RewardOfferOptions {
  placement: RewardPlacement;
  ctx: ClaimContext;
  width?: number;
  height?: number;
  fontSize?: number;
  /** "Reroll" -> "Reroll - Watch ad". */
  prefix?: string;
  style?: ButtonStyleName;
  depth?: number;
  /** Runs once, only after the claim succeeded: grant the reward here. */
  onGranted: (result: Extract<ClaimResult, { ok: true }>) => void;
  /** True while a claim is pending, so the scene can lock its other controls. */
  onBusyChange?: (busy: boolean) => void;
}

export interface UIRewardOffer {
  readonly container: Phaser.GameObjects.Container;
  readonly isBusy: boolean;
  /** Visible = the reward can be claimed (or is being claimed) right now. */
  readonly visible: boolean;
  /** Hold the button disabled (but visible), e.g. until the player picked an option. */
  setBlocked(blocked: boolean): void;
  /** Re-read rewards.quote() (call after anything that can change it). */
  refresh(): void;
  destroy(): void;
}

export function createRewardOffer(scene: Phaser.Scene, x: number, y: number, opts: RewardOfferOptions): UIRewardOffer {
  ensureOverlayTextures(scene);
  const state = new RewardOfferState(() => services.rewards.quote(opts.placement, opts.ctx), opts.prefix);
  let alive = true;
  let shown: ReturnType<RewardOfferState['view']> | null = null;
  let iconMode: string | null = null;

  const button: UIButton = createButton(scene, 0, 0, {
    label: '', width: opts.width ?? 440, height: opts.height ?? 104, fontSize: opts.fontSize ?? 36, style: opts.style ?? 'success',
    depth: opts.depth ?? DEPTH.panel + 5,
    onClick: () => { void tap(); },
  });
  const container = scene.add.container(x, y).setDepth(opts.depth ?? DEPTH.panel + 5);
  container.add(button.container);
  button.container.setDepth(0);

  const render = (): void => {
    if (!alive) return;
    const v = state.view();
    shown = v;
    container.setVisible(v.visible);
    button.setVisible(v.visible);
    if (!v.visible) return;
    button.setLabel(v.label);
    if (v.mode !== iconMode) { iconMode = v.mode; button.setIcon(v.mode === 'gems' ? 'icon_gem' : 'icon_ad'); }
    button.setEnabled(v.enabled);
  };

  async function tap(): Promise<void> {
    if (!state.begin()) return;
    opts.onBusyChange?.(true);
    render();
    let result: ClaimResult;
    try {
      result = await services.rewards.claim(opts.placement, opts.ctx);
    } catch {
      result = { ok: false, reason: 'failed' };
    }
    const outcome = state.finish(result);
    if (alive) {
      render();
      if (outcome.message && scene.sys.isActive()) showToast(scene, outcome.message, { kind: 'danger', y: 150 });
    }
    opts.onBusyChange?.(false);
    if (outcome.granted && result.ok) opts.onGranted(result);
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { alive = false; });
  render();

  return {
    container,
    get isBusy() { return state.isBusy; },
    get visible() { return shown?.visible ?? false; },
    setBlocked(blocked) { state.setBlocked(blocked); render(); },
    refresh: render,
    destroy() { alive = false; container.destroy(); },
  };
}
