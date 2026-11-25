import { beforeEach, describe, expect, it } from 'vitest';
import { countdownSeconds } from './useCountdown';
import { syncServerTime } from '../utils/serverClock';

describe('useCountdown clock calculations', () => {
  beforeEach(() => syncServerTime(new Date(10_000).toISOString(), 10_000));

  it('applies the server clock offset when calculating remaining seconds', () => {
    syncServerTime(new Date(12_500).toISOString(), 10_000);
    expect(countdownSeconds(new Date(17_000).toISOString(), 10_000)).toBe(5);
  });

  it('reaches zero at the sale boundary without a page reload', () => {
    syncServerTime(new Date(20_000).toISOString(), 10_000);
    const target = new Date(22_000).toISOString();
    expect(countdownSeconds(target, 10_000)).toBe(2);
    expect(countdownSeconds(target, 12_000)).toBe(0);
  });
});
