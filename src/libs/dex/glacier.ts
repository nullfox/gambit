import { BigNumber } from 'ethers';
import { Factory_avax_glacier } from '../../typechain/Factory_avax_glacier.js';

import { Router_arb_camelot } from '../../typechain/Router_arb_camelot.js';
import Pair from '../pair.js';

export class GlacierFactory {
  protected factory: Factory_avax_glacier;

  constructor(factory: Factory_avax_glacier) {
    this.factory = factory;
  }

  async getPair(token1: Token | SourceToken, token2: Token | SourceToken) {
    const stable =
      ((token1 as SourceToken).type &&
        (token1 as SourceToken).type === 'stable') ||
      ((token2 as SourceToken).type &&
        (token2 as SourceToken).type === 'stable');

    return this.factory.callStatic.getPair(
      token1.address,
      token2.address,
      stable,
    );
  }
}

export default class Glacier {
  protected pair: Pair;

  constructor(pair: Pair) {
    this.pair = pair;
  }

  getRouter(): Router_arb_camelot {
    return this.pair.getDex().getRouter() as Router_arb_camelot;
  }

  getParams() {
    const router = this.getRouter();
    const path = [
      this.pair.getSourceToken().address,
      this.pair.getTargetToken().address,
    ];
    const wallet = this.pair.getWallet().address;

    return {
      router,
      path,
      wallet,
    };
  }

  buy(inputTokenAmount: BigNumber, amountOutMin: BigNumber) {
    const params = this.getParams();

    return {
      estimate: async (options: DexOptions) =>
        params.router.estimateGas.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),
    };
  }

  buyNative(amountOutMin: BigNumber) {
    const params = this.getParams();

    return {
      estimate: async (options: DexOptions & { value: BigNumber }) =>
        params.router.estimateGas.swapExactETHForTokensSupportingFeeOnTransferTokens(
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions & { value: BigNumber }) =>
        params.router.swapExactETHForTokensSupportingFeeOnTransferTokens(
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),
    };
  }

  sell(inputTokenAmount: BigNumber, amountOutMin: BigNumber) {
    const params = this.getParams();

    return {
      estimate: async (options: DexOptions) =>
        params.router.estimateGas.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),
    };
  }

  sellNative(inputTokenAmount: BigNumber, amountOutMin: BigNumber) {
    const params = this.getParams();

    return {
      estimate: async (options: DexOptions) =>
        params.router.estimateGas.swapExactTokensForETHSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForETHSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          '0x0000000000000000000000000000000000000000',
          Date.now() + 1000 * 60 * 10,
          options,
        ),
    };
  }
}
