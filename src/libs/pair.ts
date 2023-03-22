import { BigNumber, BigNumberish, Wallet, ethers } from 'ethers';
import pino, { Logger } from 'pino';

import {
  BP_DIVISOR,
  GAS_LIMIT_THRESHOLD,
  GAS_MULTIPLIER,
  LOG_LEVEL,
} from '../constants.js';
import * as Typechain from '../typechain/index.js';
import Dex from './dex.js';
import Camelot from './dex/camelot.js';
import Primary from './dex/primary.js';

const pairAdapters = {
  camelot: Camelot,
};

const getPairAdapter = (dexName: string, pair: Pair) => {
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

    await this.approveSourceToken();

    // Get our minimum amount out, accounting for slippage config
    const amountOut = await this.getPricePerSourceToken(inputTokenAmount);

    const amountOutMin = amountOut.sub(
      amountOut.mul(buyConfiguration.slippage).div(100),
    );

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

    gas = estimatedGas;

    const blackGasThresholdBasis = GAS_LIMIT_THRESHOLD * BP_DIVISOR;

    const latestBlock = await this.dex.getChain().getLatestBlock();
    const blockGasLimit = latestBlock.gasLimit.eq(0)
      ? BigNumber.from(1500000)
      : latestBlock.gasLimit.gt(8000000)
      ? BigNumber.from(8000000)
      : latestBlock.gasLimit;
    const blockGasLimitThreshold = blockGasLimit
      .mul(blackGasThresholdBasis)
      .div(BP_DIVISOR);

    if (gas.gte(blockGasLimitThreshold)) {
      this.logger.info(
        {
          blockGasLimit: blockGasLimit.toString(),
          blockGasLimitThreshold: blockGasLimitThreshold.toString(),
          gas: gas.toString(),
          blockGasLimitThresholdPercent: blackGasThresholdBasis / BP_DIVISOR,
        },
        'Estimated gas is higher than block gas limit threshold, setting to block gas limit threshold',
      );

      gas = blockGasLimitThreshold;
    }

    gas = gas.mul(GAS_MULTIPLIER * BP_DIVISOR).div(BP_DIVISOR);

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

    const amountOutMin = amountOut.sub(
      amountOut.mul(sellConfiguration.slippage).div(100),
    );

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

    const allowance = await this.approveTargetToken();

    console.log('=== SELL', {
      amount: amount.toString(),
      inputTokenAmount: inputTokenAmount.toString(),
      amountOut: amountOut.toString(),
      amountOutMin: amountOutMin.toString(),
      gasPrice: gasPrice.toString(),
      allowance: allowance.toString(),
    });

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

    gas = estimatedGas;

    const blackGasThresholdBasis = GAS_LIMIT_THRESHOLD * BP_DIVISOR;

    const latestBlock = await this.dex.getChain().getLatestBlock();
    const blockGasLimit = latestBlock.gasLimit.eq(0)
      ? BigNumber.from(1500000)
      : latestBlock.gasLimit.gt(8000000)
      ? BigNumber.from(8000000)
      : latestBlock.gasLimit;
    const blockGasLimitThreshold = blockGasLimit
      .mul(blackGasThresholdBasis)
      .div(BP_DIVISOR);

    if (gas.gte(blockGasLimitThreshold)) {
      this.logger.info(
        {
          blockGasLimit: blockGasLimit.toString(),
          blockGasLimitThreshold: blockGasLimitThreshold.toString(),
          gas: gas.toString(),
          blockGasLimitThresholdPercent: blackGasThresholdBasis / BP_DIVISOR,
        },
        'Estimated gas is higher than block gas limit threshold, setting to block gas limit threshold',
      );

      gas = blockGasLimitThreshold;
    }

    gas = gas.mul(GAS_MULTIPLIER * BP_DIVISOR).div(BP_DIVISOR);

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

  async approveSourceToken() {
    const allowance = await this.sourceToken.contract.allowance(
      this.wallet.address,
      this.dex.getRouter().address,
    );

    if (allowance.gt(0)) {
      return allowance;
    }

    const max = BigNumber.from(
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    );

    await this.sourceToken.contract.approve(this.dex.getRouter().address, max);

    return max;
  }

  async approveTargetToken() {
    const allowance = await this.targetToken.contract.allowance(
      this.wallet.address,
      this.dex.getRouter().address,
    );

    if (allowance.gt(0)) {
      return allowance;
    }

    const max = BigNumber.from(
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    );

    await this.targetToken.contract.approve(this.dex.getRouter().address, max);

    return max;
  }
}
