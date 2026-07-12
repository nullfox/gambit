import { BigNumber } from 'ethers';

import { BP_DIVISOR, GAS_LIMIT_THRESHOLD, GAS_MULTIPLIER } from '../constants.js';

// Pure, side-effect-free helpers for the numeric parts of trade construction:
// slippage tolerance and the gas-limit policy. Kept separate from Pair so they
// can be unit tested without an RPC, a wallet, or a live chain.

/**
 * Minimum acceptable output after applying an integer-percent slippage
 * tolerance:
 *
 *   amountOutMin = amountOut - amountOut * (slippagePercent / 100)
 *
 * Done entirely in BigNumber space so there is no precision loss on
 * wei-scale values.
 */
export const applySlippage = (
  amountOut: BigNumber,
  slippagePercent: number,
): BigNumber => amountOut.sub(amountOut.mul(slippagePercent).div(100));

/**
 * Clamp a raw block gas limit into the working range the bot assumes. Some
 * RPCs report 0 for `gasLimit`; fall back to 1.5M there and cap absurdly high
 * limits at 8M so the percentage ceiling below stays meaningful.
 */
export const normalizeBlockGasLimit = (blockGasLimit: BigNumber): BigNumber => {
  if (blockGasLimit.eq(0)) {
    return BigNumber.from(1_500_000);
  }

  if (blockGasLimit.gt(8_000_000)) {
    return BigNumber.from(8_000_000);
  }

  return blockGasLimit;
};

/**
 * Gas ceiling = GAS_LIMIT_THRESHOLD percent of the normalized block gas limit.
 *
 * The threshold percent is converted to integer basis points before the
 * multiply so the whole computation stays in integer BigNumber space (mul()
 * rejects non-integers). e.g. a 60% threshold becomes 6000 / BP_DIVISOR.
 */
export const blockGasCeiling = (blockGasLimit: BigNumber): BigNumber => {
  const thresholdBasisPoints = Math.round(
    (GAS_LIMIT_THRESHOLD / 100) * BP_DIVISOR,
  );

  return normalizeBlockGasLimit(blockGasLimit)
    .mul(thresholdBasisPoints)
    .div(BP_DIVISOR);
};

/**
 * Scale a gas figure by GAS_MULTIPLIER. The multiplier is pre-scaled into
 * integer basis points (1.4 -> 14000) because BigNumber.mul() only accepts
 * integers.
 */
export const applyGasMultiplier = (gas: BigNumber): BigNumber =>
  gas.mul(Math.round(GAS_MULTIPLIER * BP_DIVISOR)).div(BP_DIVISOR);

/**
 * Full gas-limit policy: cap the estimate at the block-gas ceiling, then apply
 * the safety multiplier. Returns the gas limit to submit with the transaction.
 */
export const clampGas = (
  estimatedGas: BigNumber,
  blockGasLimit: BigNumber,
): BigNumber => {
  const ceiling = blockGasCeiling(blockGasLimit);
  const capped = estimatedGas.gte(ceiling) ? ceiling : estimatedGas;

  return applyGasMultiplier(capped);
};
