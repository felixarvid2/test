import { describe, expect, it, vi } from 'vitest';
import { createServices } from '../../src/services';
import { MockRewardProvider } from '../../src/rewards/MockRewardProvider';
import { FakePlatform } from './fakePlatform';

async function setup(opts: { stored?: string | null } = {}) {
  const platform = new FakePlatform(opts.stored ?? null);
  const provider = new MockRewardProvider({ mode: 'manual' });
  platform.provider = provider;
  const s = await createServices(platform);
  const pause = vi.fn();
  const resume = vi.fn();
  s.setGameLoopControls({ pause, resume });
  return { platform, provider, s, pause, resume };
}

describe('services wiring', () => {
  it('flushes the save and pauses the game loop and audio on host pause, resumes on host resume', async () => {
    const { platform, s, pause, resume } = await setup();
    const audioPause = vi.spyOn(s.audio, 'pauseAll');
    const audioResume = vi.spyOn(s.audio, 'resumeAll');
    s.save.update((d) => { d.gems = 12; });
    platform.pause();
    await vi.waitFor(() => expect(platform.writes).toHaveLength(1));
    expect(JSON.parse(platform.writes[0]).gems).toBe(12);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(audioPause).toHaveBeenCalledTimes(1);
    platform.resume();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(audioResume).toHaveBeenCalledTimes(1);
  });

  it('applies saved settings and host audio state to the audio manager', async () => {
    const stored = JSON.stringify({ settings: { musicVolume: 0.2, sfxVolume: 0.3, muted: true } });
    const platform = new FakePlatform(stored);
    platform.audioEnabled = false;
    const setSettings = vi.spyOn((await import('../../src/audio/AudioManager')).AudioManager.prototype, 'setSettings');
    const setMuted = vi.spyOn((await import('../../src/audio/AudioManager')).AudioManager.prototype, 'setMuted');
    const setHost = vi.spyOn((await import('../../src/audio/AudioManager')).AudioManager.prototype, 'setHostEnabled');
    const s = await createServices(platform);
    expect(setSettings).toHaveBeenLastCalledWith(0.2, 0.3);
    expect(setMuted).toHaveBeenLastCalledWith(true);
    expect(setHost).toHaveBeenLastCalledWith(false);
    platform.setAudio(true);
    expect(setHost).toHaveBeenLastCalledWith(true);
    s.save.update((d) => { d.settings.musicVolume = 0.9; d.settings.muted = false; });
    expect(setSettings).toHaveBeenLastCalledWith(0.9, 0.3);
    expect(setMuted).toHaveBeenLastCalledWith(false);
    vi.restoreAllMocks();
  });

  it('pauses the loop for the duration of a rewarded ad and resumes after', async () => {
    const { provider, s, pause, resume } = await setup();
    const claim = s.rewards.claim('revive', { runId: 'r1' });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
    provider.complete();
    expect((await claim).ok).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('also resumes after a cancelled ad', async () => {
    const { provider, s, pause, resume } = await setup();
    const claim = s.rewards.claim('revive', { runId: 'r1' });
    provider.cancel();
    expect(await claim).toEqual({ ok: false, reason: 'cancelled' });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('a host pause/resume during an ad does not restart the game early, and the claim still needs the real result', async () => {
    const { platform, provider, s, pause, resume } = await setup();
    const claim = s.rewards.claim('revive', { runId: 'r1' });
    let settled = false;
    void claim.then(() => { settled = true; });
    platform.pause();
    platform.resume();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1); // one pause for ad + host together
    expect(resume).not.toHaveBeenCalled();
    provider.complete();
    expect((await claim).ok).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('stays paused after an ad until the host resumes', async () => {
    const { platform, provider, s, resume } = await setup();
    const claim = s.rewards.claim('revive', { runId: 'r1' });
    platform.pause();
    provider.complete();
    await claim;
    expect(resume).not.toHaveBeenCalled();
    platform.resume();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('applies the pause to controls registered while already paused', async () => {
    const { platform, s } = await setup();
    platform.pause();
    const pause = vi.fn();
    s.setGameLoopControls({ pause, resume: vi.fn() });
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('survives game loop controls that throw', async () => {
    const { platform, s } = await setup();
    s.setGameLoopControls({ pause: () => { throw new Error('x'); }, resume: () => { throw new Error('y'); } });
    platform.pause();
    platform.resume();
    expect(platform.errors).toHaveLength(2);
  });
});
