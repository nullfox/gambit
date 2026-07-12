import { BigNumber, BigNumberish, Wallet, ethers } from 'ethers';
import pino, { Logger } from 'pino';

import { GAS_LIMIT_THRESHOLD, LOG_LEVEL } from '../constants.js';
import * as Typechain from '../typechain/index.js';
import Dex from './dex.js';
import Camelot from './dex/camelot.js';
import Primary from './dex/primary.js';
import { applySlippage, blockGasCeiling, clampGas } from './execution.js';

const pairAdapters = {
  camelot: Camelot,
};

export const getPairAdapter = (dexName: string, pair: Pair) => {
  if (!Object.keys(pairAdapters).includes(dexName)) {
    return new Primary(pair);
  }

  const Adapter = pairAdapters[dexName as keyof typeof pairAdapters];

  return new Adapter(pair);
};

export default class Pair {
  private contract: Typechain.Pair;
  private dex: Dex;
  private wallet: Wallet;

  private sourceToken: SourceToken;
  private targetToken: Token;
  private token0: SourceToken | Token;
  private token1: SourceToken | Token;

  private logger: Logger;

  private liquidity: BigNumber | undefined;

  constructor(
    contract: Typechain.Pair,
    sourceToken: SourceToken,
    targetToken: Token,
    sourceIsToken0: boolean,
    dex: Dex,
    wallet: Wallet,
  ) {
    this.contract = contract;
    this.dex = dex;
    this.wallet = wallet;

    this.sourceToken = sourceToken;
    this.targetToken = targetToken;
    this.token0 = sourceIsToken0 ? sourceToken : targetToken;
    this.token1 = sourceIsToken0 ? targetToken : sourceToken;

    this.logger = pino({
      name: 'class::pair',
      level: LOG_LEVEL,
    });
  }

  getDex() {
    return this.dex;
  }

  getAddress() {
    return this.contract.address;
  }

  getSourceToken() {
    return this.sourceToken;
  }

  getTargetToken() {
    return this.targetToken;
  }

  getToken0() {
    return this.token0;
  }

  getToken1() {
    return this.token1;
  }

  getWallet() {
    return this.wallet;
  }

  async getLiquidity() {
    if (!this.liquidity) {
      this.liquidity = await this.sourceToken.contract.callStatic.balanceOf(
        this.contract.address,
      );
    }

    return this.liquidity;
  }

  async getLiquidityNumber() {
    const liquidity = await this.getLiquidity();

    return parseFloat(
      ethers.utils.formatUnits(liquidity, this.sourceToken.decimals),
    );
  }

  async getReserves() {
    return this.dex
      .getRouter()
      .getAmountsOut(ethers.utils.parseUnits('1', this.sourceToken.decimals), [
        this.sourceToken.address,
        this.targetToken.address,
      ]);
  }

  async getPrices() {
    const reserves = await this.getReserves();

    const lift = 6;
    const divisor = 10 ** lift;

    const reserve0 =
      reserves[0]
        .mul(divisor)
        .div(BigNumber.from(10).pow(this.token0.decimals))
        .toNumber() / divisor;
    const reserve1 =
      reserves[1]
        .mul(divisor)
        .div(BigNumber.from(10).pow(this.token1.decimals))
        .toNumber() / divisor;

    if (this.token0.address === this.sourceToken.address) {
      return {
        price: reserve0 / reserve1,
        inverse: reserve1 / reserve0,
      };
    }

    return {
      price: reserve1 / reserve0,
      inverse: reserve0 / reserve1,
    };
  }

  async getPricePerSourceToken(amount?: BigNumber) {
    amount = amount || ethers.utils.parseUnits('1', this.sourceToken.decimals);

    const amounts = await this.dex
      .getRouter()
      .getAmountsOut(amount, [
        this.sourceToken.address,
        this.targetToken.address,
      ]);

    return amounts[1];
  }

  async getPricePerTargetToken(amount?: BigNumber) {
    amount = amount || ethers.utils.parseUnits('1', this.targetToken.decimals);

    const amounts = await this.dex
      .getRouter()
      .getAmountsOut(amount, [
        this.targetToken.address,
        this.sourceToken.address,
      ]);

    return amounts[1];
  }

  async getPriceImpactFromTargetToken(amount?: BigNumber) {
    amount = amount || ethers.utils.parseUnits('1', this.targetToken.decimals);

    const reserves = await this.contract.getReserves();

    const reserve =
      this.token0.address === this.targetToken.address
        ? reserves[0]
        : reserves[1];

    return (
      parseFloat(
        amount
          .mul(BigNumber.from(10).pow(9))
          .div(reserve.add(amount))
          .toString(),
      ) /
      10 ** 7
    );
  }

  async buy(amount: BigNumberish) {
    const buyConfiguration = this.dex.getChain().getConfiguration().buy;

    // Format our input amount
    const inputTokenAmount = ethers.utils.parseUnits(
      amount.toString(),
      this.sourceToken.decimals,
    );

    await this.approveSourceToken(inputTokenAmount);

    // Get our minimum amount out, accounting for slippage config
    const amountOut = await this.getPricePerSourceToken(inputTokenAmount);

    const amountOutMin = applySlippage(amountOut, buyConfiguration.slippage);

    // Setup our gas limits
    const gasPrice = ethers.utils.parseUnits(
      buyConfiguration.gwei.toString(),
      'gwei',
    );
    const gasLimit = buyConfiguration.gas.toString();

    // Set the value to be input into the transaction
    // only when the source token is the native token
    // aka: ETH on Ethereum, BNB on BSC, etc.
    let transactionValue = BigNumber.from(0);
    let estimatedGas = BigNumber.from(0);
    let gas = BigNumber.from(gasLimit);

    const pairAdapter = getPairAdapter(this.dex.getName(), this);

    if (this.sourceToken.type === 'native') {
      transactionValue = inputTokenAmount;

      estimatedGas = await pairAdapter.buyNative(amountOutMin).estimate({
        value: transactionValue,
        gasPrice,
        gasLimit,
      });
    } else {
      estimatedGas = await pairAdapter
        .buy(inputTokenAmount, amountOutMin)
        .estimate({
          gasPrice,
          gasLimit,
        });
    }

    const latestBlock = await this.dex.getChain().getLatestBlock();
    const ceiling = blockGasCeiling(latestBlock.gasLimit);

    if (estimatedGas.gte(ceiling)) {
      this.logger.info(
        {
          blockGasLimit: latestBlock.gasLimit.toString(),
          blockGasCeiling: ceiling.toString(),
          estimatedGas: estimatedGas.toString(),
          thresholdPercent: GAS_LIMIT_THRESHOLD,
        },
        'Estimated gas exceeds the block gas ceiling — clamping to ceiling',
      );
    }

    gas = clampGas(estimatedGas, latestBlock.gasLimit);

    const nonce = await this.wallet.getTransactionCount('pending');

    this.logger.info(
      {
        human: {
          inputTokenAmount: ethers.utils.formatUnits(
            inputTokenAmount.toString(),
            this.sourceToken.decimals,
          ),
          minOutputTokenAmount: ethers.utils.formatUnits(
            amountOutMin.toString(),
            this.targetToken.decimals,
          ),
          transactionValue: ethers.utils.formatUnits(
            transactionValue,
            this.targetToken.decimals,
          ),
          estimatedGas: ethers.utils.formatUnits(
            estimatedGas,
            this.targetToken.decimals,
          ),
          gas: ethers.utils.formatUnits(gas, this.targetToken.decimals),
        },
        raw: {
          inputTokenAmount: inputTokenAmount.toString(),
          minOutputTokenAmount: amountOutMin.toString(),
          transactionValue: transactionValue.toString(),
          estimatedGas: estimatedGas.toString(),
          gas: gas.toString(),
        },
      },
      'Preparing transaction',
    );

    if (this.sourceToken.type === 'native') {
      const tx = await pairAdapter.buyNative(amountOutMin).execute({
        value: transactionValue,
        gasPrice,
        gasLimit: gas,
        nonce,
      });

      return tx.wait();
    }

    const tx = await pairAdapter.buy(inputTokenAmount, amountOutMin).execute({
      gasPrice,
      gasLimit: gas,
      nonce,
    });

    return tx.wait();
  }

  async sell(amount: BigNumberish) {
    const sellConfiguration = this.dex.getChain().getConfiguration().sell;

    // Format our input amount
    const inputTokenAmount = ethers.utils.parseUnits(
      amount.toString(),
      this.targetToken.decimals,
    );

    // Get our minimum amount out, accounting for slippage config
    const amountOut = await this.getPricePerTargetToken(inputTokenAmount);

    const amountOutMin = applySlippage(amountOut, sellConfiguration.slippage);

    // Setup our gas limits
    const gasPrice = ethers.utils.parseUnits(
      sellConfiguration.gwei.toString(),
      'gwei',
    );
    const gasLimit = sellConfiguration.gas.toString();

    // Set the value to be input into the transaction
    // only when the source token is the native token
    // aka: ETH on Ethereum, BNB on BSC, etc.
    let transactionValue = BigNumber.from(0);
    let estimatedGas = BigNumber.from(0);
    let gas = BigNumber.from(gasLimit);

    const pairAdapter = getPairAdapter(this.dex.getName(), this);

    await this.approveTargetToken(inputTokenAmount);

    if (this.sourceToken.type === 'native') {
      transactionValue = inputTokenAmount;

      estimatedGas = await pairAdapter
        .sellNative(inputTokenAmount, amountOutMin)
        .estimate({
          gasPrice,
          gasLimit,
        });
    } else {
      estimatedGas = await pairAdapter
        .sell(inputTokenAmount, amountOutMin)
        .estimate({
          gasPrice,
          gasLimit,
        });
    }

    const latestBlock = await this.dex.getChain().getLatestBlock();
    const ceiling = blockGasCeiling(latestBlock.gasLimit);

    if (estimatedGas.gte(ceiling)) {
      this.logger.info(
        {
          blockGasLimit: latestBlock.gasLimit.toString(),
          blockGasCeiling: ceiling.toString(),
          estimatedGas: estimatedGas.toString(),
          thresholdPercent: GAS_LIMIT_THRESHOLD,
        },
        'Estimated gas exceeds the block gas ceiling — clamping to ceiling',
      );
    }

    gas = clampGas(estimatedGas, latestBlock.gasLimit);

    const nonce = await this.wallet.getTransactionCount('pending');

    this.logger.info(
      {
        human: {
          inputTokenAmount: ethers.utils.formatUnits(
            inputTokenAmount.toString(),
            this.sourceToken.decimals,
          ),
          minOutputTokenAmount: ethers.utils.formatUnits(
            amountOutMin.toString(),
            this.targetToken.decimals,
          ),
          transactionValue: ethers.utils.formatUnits(
            transactionValue,
            this.targetToken.decimals,
          ),
          estimatedGas: ethers.utils.formatUnits(
            estimatedGas,
            this.targetToken.decimals,
          ),
          gas: ethers.utils.formatUnits(gas, this.targetToken.decimals),
        },
        raw: {
          inputTokenAmount: inputTokenAmount.toString(),
          minOutputTokenAmount: amountOutMin.toString(),
          transactionValue: transactionValue.toString(),
          estimatedGas: estimatedGas.toString(),
          gas: gas.toString(),
        },
      },
      'Preparing transaction',
    );

    if (this.sourceToken.type === 'native') {
      const tx = await pairAdapter
        .sellNative(inputTokenAmount, amountOutMin)
        .execute({
          gasPrice,
          gasLimit,
          nonce,
        });

      return tx.wait();
    }

    const tx = await pairAdapter.sell(inputTokenAmount, amountOutMin).execute({
      gasPrice,
      gasLimit,
      nonce,
    });

    return tx.wait();
  }

  async sellPercent(percent: number) {
    const balance = await this.dex.getChain().getTokenBalance(this.targetToken);

    const balanceNumber = parseFloat(
      ethers.utils.formatUnits(balance, this.targetToken.decimals),
    );

    return this.sell(balanceNumber * (percent / 100));
  }

  async approveSourceToken(amount?: BigNumber) {
    return this.approveToken(this.sourceToken, amount);
  }

  async approveTargetToken(amount?: BigNumber) {
    return this.approveToken(this.targetToken, amount);
  }

  // Approve the router to spend `token`. By default this grants an unlimited
  // (max-uint) allowance — one approval covers every future trade, saving the
  // per-trade approval gas and latency that matter when sniping. When the
  // chain is configured for exact approvals, only `amount` is granted instead,
  // which limits how much a compromised or malicious router can ever pull.
  private async approveToken(token: Token | SourceToken, amount?: BigNumber) {
    const spender = this.dex.getRouter().address;

    const allowance = await token.contract.allowance(
      this.wallet.address,
      spender,
    );

    const exact = this.dex.getChain().useExactApproval() && !!amount;
    const required = exact ? (amount as BigNumber) : ethers.constants.MaxUint256;

    // Existing allowance already covers what this trade needs.
    if (allowance.gte(required)) {
      return allowance;
    }

    await token.contract.approve(spender, required);

    return required;
  }
}
