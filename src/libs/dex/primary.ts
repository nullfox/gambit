import { BigNumber } from 'ethers';
import { Factory } from '../../typechain/Factory.js';

import { Router } from '../../typechain/Router.js';
import Pair from '../pair.js';

export class PrimaryFactory {
  protected factory: Factory;

  constructor(factory: Factory) {
    this.factory = factory;
  }

  async getPair(token1: Token, token2: Token) {
    return this.factory.callStatic.getPair(token1.address, token2.address);
  }
}

export default class Primary {
  protected pair: Pair;

  constructor(pair: Pair) {
    this.pair = pair;
  }

  getPair() {
    return this.pair;
  }

  getRouter(): Router {
    return this.pair.getDex().getRouter() as Router;
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
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
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
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions & { value: BigNumber }) =>
        params.router.swapExactETHForTokensSupportingFeeOnTransferTokens(
          amountOutMin,
          params.path,
          params.wallet,
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
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
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
          Date.now() + 1000 * 60 * 10,
          options,
        ),

      execute: async (options: DexNonceOptions) =>
        params.router.swapExactTokensForETHSupportingFeeOnTransferTokens(
          inputTokenAmount,
          amountOutMin,
          params.path,
          params.wallet,
          Date.now() + 1000 * 60 * 10,
          options,
        ),
    };
  }
}
