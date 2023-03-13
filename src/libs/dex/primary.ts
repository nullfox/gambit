import { BigNumber, constants } from 'ethers';

import { Router } from '../../typechain/Router.js';
import Pair from '../pair.js';

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
      estimate: async (options: DexOptions & { value: BigNumber }) => {
        console.log(
          await this.getPair()
            .getSourceToken()
            .contract.allowance(
              this.getPair().getWallet().address,
              this.getPair().getDex().getRouter().address,
            ),
        );

        console.log(
          await this.getPair()
            .getTargetToken()
            .contract.allowance(
              this.getPair().getWallet().address,
              this.getPair().getDex().getRouter().address,
            ),
        );

        await this.getPair()
          .getTargetToken()
          .contract.approve(this.getRouter().address, constants.MaxUint256);

        return params.router.estimateGas.swapExactETHForTokensSupportingFeeOnTransferTokens(
          amountOutMin,
          params.path,
          params.wallet,
          Date.now() + 1000 * 60 * 10,
          options,
        );
      },

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
