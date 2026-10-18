import { describe, expect, it } from 'vitest';
import {
  clamp, columnLayout, fillWidth, fitScale, formatNumber, formatTime, gridLayout, rowLayout, textResolutionFor, touchSize,
} from '../../src/game/ui/format';
import { MIN_TOUCH, hex, textStyle } from '../../src/game/ui/theme';

describe('formatNumber', () => {
  it('leaves small numbers alone', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(999)).toBe('999');
  });
  it('abbreviates thousands, millions, billions', () => {
    expect(formatNumber(1000)).toBe('1k');
    expect(formatNumber(1200)).toBe('1.2k');
    expect(formatNumber(15300)).toBe('15.3k');
    expect(formatNumber(123456)).toBe('123k');
    expect(formatNumber(1_500_000)).toBe('1.5M');
    expect(formatNumber(2_000_000_000)).toBe('2B');
  });
  it('rounds down and never rolls over to 1000k', () => {
    expect(formatNumber(999_999)).toBe('999k');
    expect(formatNumber(1999)).toBe('1.9k');
  });
  it('handles negatives and bad input', () => {
    expect(formatNumber(-1500)).toBe('-1.5k');
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('0');
    expect(formatNumber(12.9)).toBe('12');
  });
});

describe('formatTime', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(-4)).toBe('0:00');
  });
});

describe('math helpers', () => {
  it('clamp and touchSize', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(touchSize(40)).toBe(MIN_TOUCH);
    expect(touchSize(120)).toBe(120);
  });
  it('fitScale never enlarges by default', () => {
    expect(fitScale(200, 100, 100, 100)).toBe(0.5);
    expect(fitScale(50, 50, 100, 100)).toBe(1);
    expect(fitScale(50, 50, 100, 100, true)).toBe(2);
    expect(fitScale(0, 0, 100, 100)).toBe(1);
  });
  it('fillWidth', () => {
    expect(fillWidth(0, 100)).toBe(0);
    expect(fillWidth(0.5, 100)).toBe(50);
    expect(fillWidth(2, 100)).toBe(100);
    expect(fillWidth(0.01, 100, 20)).toBe(20);
    expect(fillWidth(NaN, 100)).toBe(0);
  });
});

describe('layout', () => {
  it('rowLayout centres items on cx', () => {
    const p = rowLayout(3, 100, 20, 360);
    expect(p.map((q) => q.x)).toEqual([240, 360, 480]);
    expect(rowLayout(1, 100, 20, 360)[0].x).toBe(360);
    expect(rowLayout(0, 100, 20, 360)).toEqual([]);
  });
  it('columnLayout centres items on cy', () => {
    expect(columnLayout(2, 80, 20, 500).map((q) => q.y)).toEqual([450, 550]);
  });
  it('gridLayout wraps rows and centres the last row', () => {
    const p = gridLayout(5, 3, 100, 100, 10, 360, 400);
    expect(p).toHaveLength(5);
    expect(p[0].y).toBe(p[2].y);
    expect(p[3].y).toBe(p[0].y + 110);
    expect(p[3].x).toBeCloseTo(360 - 55);
    expect(p[4].x).toBeCloseTo(360 + 55);
    // the whole block is centred vertically
    expect((p[0].y + p[3].y) / 2).toBe(400);
  });
});

describe('textResolutionFor', () => {
  it('scales with display size and dpr, clamped to 1..3', () => {
    expect(textResolutionFor(360, 720, 1)).toBe(1);
    expect(textResolutionFor(360, 720, 3)).toBe(2);
    expect(textResolutionFor(720, 720, 2)).toBe(2);
    expect(textResolutionFor(1440, 720, 3)).toBe(3);
    expect(textResolutionFor(100, 720, 1)).toBe(1);
    expect(textResolutionFor(0, 720, 2)).toBe(2);
  });
});

describe('theme', () => {
  it('hex pads to 6 digits', () => {
    expect(hex(0xff)).toBe('#0000ff');
    expect(hex(0xffd35e)).toBe('#ffd35e');
  });
  it('textStyle merges overrides and scales the stroke with size', () => {
    const s = textStyle('heading', { size: 20, colorNum: 0xff0000 });
    expect(s.fontSize).toBe('20px');
    expect(s.color).toBe('#ff0000');
    expect(s.strokeThickness).toBe(4);
    expect(textStyle('body', { strokeThickness: 1, size: 60 }).strokeThickness).toBe(1);
  });
});
