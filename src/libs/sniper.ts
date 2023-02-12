import { Wallet } from 'ethers';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';

import {
  WALLET_DIR,
  WALLET_EXTENSION_ENCRYPTED,
  WALLET_EXTENSION_RAW,
} from '../constants.js';
import * as crypt from '../services/crypt.js';
import Chain from './chain.js';
import Pair from './pair.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export default class Sniper {
  static getWallet(walletName: string, password?: string) {
    const inPath = join(
      WALLET_DIR,
      `${walletName}.${
        password ? WALLET_EXTENSION_ENCRYPTED : WALLET_EXTENSION_RAW
      }`,
    );

    if (!existsSync(inPath)) {
      throw new Error(
        `Could not open file "${inPath}" - please ensure it exists`,
      );
    }

    const walletBuffer = readFileSync(inPath);

    if (password) {
      const parsed: WalletConfig = JSON.parse(
        crypt.decrypt(walletBuffer, password).toString('utf-8'),
      );

      return {
        address: parsed.address,
        wallet: new Wallet(`0x${parsed.key}`),
      };
    }

    const parsed: WalletConfig = JSON.parse(walletBuffer.toString('utf-8'));

    return {
      address: parsed.address,
      wallet: new Wallet(`0x${parsed.key}`),
    };
  }

  private wallet: Wallet;
  private chain: Chain;
  private tokenAddress: string;

  constructor(
    walletName: string,
    chainName: string,
    tokenAddress: string,
    dexName?: string,
    options?: {
      password?: string;
      totalSpend?: number;
      loopSpend?: number;
      forceGas?: number;
    },
  ) {
    // Setup wallet (non-connected)
    const loadedWallet = Sniper.getWallet(walletName, options?.password);
    this.wallet = loadedWallet.wallet;

    this.tokenAddress = tokenAddress;

    this.chain = Chain.fromName(chainName, this.wallet, {
      dex: dexName,
    });

    logger.debug(
      {
        tokenAddress: this.tokenAddress,
        chain: {
          name: this.chain.getName(),
          rpcs: this.chain.getRpcUrls(),
        },
        dex: this.chain.getDex().getName(),
      },
      '[Finished] Initial bootstrapping',
    );
  }

  getWallet() {
    return this.wallet;
  }

  getChain() {
    return this.chain;
  }

  getChainConfiguration() {
    return this.chain.getConfiguration();
  }

  async findOperatingPair(ignoreMinimumLp?: boolean) {
    const checkableTokens = await this.chain.getCheckableTokens();

    // Spread so when we shift, we don't fuck up by reference
    const sourceTokens = [...checkableTokens];

    const targetToken = await this.chain.getToken(this.tokenAddress);

    logger.debug(
      {
        tokens: sourceTokens.map((t) => ({
          address: t.address,
          name: t.name,
        })),
      },
      '[Started] Finding pair with liquidity',
    );

    let found: Pair | null = null;

    while (!found && sourceTokens.length > 0) {
      const token = sourceTokens.shift()!;

      const pair = await this.chain.getDex().getPair(token, targetToken);

      if (!pair) {
        continue;
      }

      const liquidityNumber = await pair.getLiquidityNumber();

      logger.debug(
        {
          token: {
            address: token.address,
            name: token.name,
          },
          pair: pair.getAddress(),
          liquidity: liquidityNumber,
          minimumLiquidity: token.minimumLp,
        },
        '[Pending] Checking pair liquidity',
      );

      if (pair && (ignoreMinimumLp || liquidityNumber >= token.minimumLp)) {
        found = pair;
      }
    }

    if (!found) {
      return undefined;
    }

    const liquidityNumber = await found.getLiquidityNumber();

    logger.debug(
      {
        sourceToken: {
          address: found.getSourceToken().address,
          name: found.getSourceToken().name,
        },
        token0: {
          address: found.getToken0().address,
          name: found.getToken0().name,
        },
        token1: {
          address: found.getToken1().address,
          name: found.getToken0().name,
        },
        pair: found.getAddress(),
        liquidity: liquidityNumber,
      },
      '[Finished] Finding pair with liquidity',
    );

    return found;
  }

  async getInteractiveShellData(pair: Pair) {
    const [
      blockNumber,
      perSourceTokenPrice,
      perTargetTokenPrice,
      targetTokenBalance,
      sourceTokenBalance,
    ] = await Promise.all([
      this.chain.getBlockNumber(),
      pair.getPricePerSourceToken(),
      pair.getPricePerTargetToken(),
      this.chain.getTokenBalance(pair.getTargetToken()),
      this.chain.getTokenBalance(pair.getSourceToken()),
    ]);

    return {
      blockNumber,
      perSourceTokenPrice,
      perTargetTokenPrice,
      targetTokenBalance,
      sourceTokenBalance,
    };
  }
}
