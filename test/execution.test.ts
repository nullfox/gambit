import { BigNumber } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  applyGasMultiplier,
  applySlippage,
  blockGasCeiling,
  clampGas,
  normalizeBlockGasLimit,
} from '../src/libs/execution.js';

const bn = (n: number | string) => BigNumber.from(n);

describe('applySlippage', () => {
  it('subtracts the given integer percent from the quote', () => {
    // 1% slippage on 1000 -> 990
    expect(applySlippage(bn(1000), 1).toString()).toBe('990');
  });

  it('returns the full quote at 0% slippage', () => {
    expect(applySlippage(bn(1000), 0).toString()).toBe('1000');
  });

  it('handles the aggressive sell slippage used in configs (25%)', () => {
    expect(applySlippage(bn(1000), 25).toString()).toBe('750');
  });

  it('returns 0 at 100% slippage', () => {
    expect(applySlippage(bn(1000), 100).toString()).toBe('0');
  });

  it('stays exact on wei-scale (18-decimal) values', () => {
    // 1.0 token (1e18 wei), 1% slippage -> 0.99e18
    const oneToken = bn('1000000000000000000');
    expect(applySlippage(oneToken, 1).toString()).toBe('990000000000000000');
  });
});

describe('normalizeBlockGasLimit', () => {
  it('falls back to 1.5M when the RPC reports 0', () => {
    expect(normalizeBlockGasLimit(bn(0)).toString()).toBe('1500000');
  });

  it('caps absurdly high limits at 8M', () => {
    expect(normalizeBlockGasLimit(bn(30_000_000)).toString()).toBe('8000000');
  });

  it('passes normal limits through untouched', () => {
    expect(normalizeBlockGasLimit(bn(5_000_000)).toString()).toBe('5000000');
  });
});

describe('blockGasCeiling', () => {
  it('is GAS_LIMIT_THRESHOLD (60) percent of the normalized limit', () => {
    // 5M * 60% = 3M
    expect(blockGasCeiling(bn(5_000_000)).toString()).toBe('3000000');
  });

  it('applies the ceiling after normalization (30M -> 8M -> 4.8M)', () => {
    expect(blockGasCeiling(bn(30_000_000)).toString()).toBe('4800000');
  });
});

describe('applyGasMultiplier', () => {
  it('scales by GAS_MULTIPLIER (1.4x)', () => {
    expect(applyGasMultiplier(bn(1_000_000)).toString()).toBe('1400000');
  });

  it('stays integer-safe via basis points (no floating point drift)', () => {
    // 1234567 * 14000 / 10000 = 1728393.8 -> floored to 1728393
    expect(applyGasMultiplier(bn(1_234_567)).toString()).toBe('1728393');
  });
});

describe('clampGas', () => {
  it('passes an estimate below the ceiling straight through the multiplier', () => {
    // ceiling(5M) = 3M; estimate 1M < 3M -> 1M * 1.4 = 1.4M
    expect(clampGas(bn(1_000_000), bn(5_000_000)).toString()).toBe('1400000');
  });

  it('clamps an estimate above the ceiling before multiplying', () => {
    // ceiling(5M) = 3M; estimate 4M > 3M -> clamp to 3M -> 3M * 1.4 = 4.2M
    expect(clampGas(bn(4_000_000), bn(5_000_000)).toString()).toBe('4200000');
  });

  it('clamps exactly at the ceiling boundary', () => {
    // estimate == ceiling (3M) counts as "at/above" -> clamp -> 4.2M
    expect(clampGas(bn(3_000_000), bn(5_000_000)).toString()).toBe('4200000');
  });
});
