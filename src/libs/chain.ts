import { BigNumber, Wallet, ethers, providers } from 'ethers';
import { existsSync, readFileSync } from 'fs';
import lodash from 'lodash';
import { join } from 'path';
import pino, { Logger } from 'pino';
import TOML from 'toml';

import { LOG_LEVEL } from '../constants.js';
import { Erc20__factory } from '../typechain/index.js';
import Dex from './dex.js';

const PATH_CHAINS_DIR = join(process.cwd(), 'configs', 'chains');

export default class Chain {
  static getConfiguration(name: string) {
    const chainConfigurationPath = join(PATH_CHAINS_DIR, `${name}.toml`);

    if (!existsSync(chainConfigurationPath)) {
      throw new Error(
        `Could not open chain cnfig file "${chainConfigurationPath}" - please ensure it exists`,
      );
    }

    const contents = readFileSync(chainConfigurationPath).toString();

    return TOML.parse(contents) as ChainConfiguration;
  }

  static fromName(name: string, wallet: Wallet, options?: { dex?: string }) {
    const configuration = this.getConfiguration(name);

    return new Chain(configuration, wallet, options);
  }

  private config: ChainConfiguration;
  private wallet: Wallet;

  private rpcProviders: providers.JsonRpcProvider[];

  private dex: Dex;

  private logger: Logger;

  private tokenCache: Map<string, Token> = new Map<string, Token>();
  private sourceTokenCache: Map<string, SourceToken> = new Map<
    string,
    SourceToken
  >();

  constructor(
    config: ChainConfiguration,
    wallet: Wallet,
    options?: { dex?: string },
  ) {
    this.config = config;

    // Setup RPC provider
    this.rpcProviders = this.config.rpc.map(
      (url) => new providers.JsonRpcProvider(url),
    );

    // Setup connected Wallet
    this.wallet = wallet.connect(this.rpcProviders[0]);

    // Setup dex
    let resolvedDexName = this.config.dex;

    if (options && options.dex) {
      resolvedDexName = options.dex;
    }

    const dex = this.config.dexes.find(
      (dex) => dex.name === resolvedDexName.toLowerCase(),
    );

    if (!dex) {
      throw new Error(
        `Selected DEX "${resolvedDexName.toLowerCase()}" does not exists in [[dexes]] configuration`,
      );
    }

    this.dex = new Dex(dex, this, this.wallet);

    this.logger = pino({
      name: 'class::chain',
      level: LOG_LEVEL,
    });
  }

  getConfiguration() {
    return this.config;
  }

  getName() {
    return this.config.name;
  }

  getRpcUrls() {
    return this.config.rpc;
  }

  getDex() {
    return this.dex;
  }

  async getBlockNumber() {
    return this.wallet.provider.getBlockNumber();
  }

  async getLatestBlock() {
    return this.wallet.provider.getBlock('latest');
  }

  async getToken(address: string): Promise<Token> {
    this.logger.debug(
      {
        address,
      },
      '[Started] Loading token',
    );

    const existing = this.tokenCache.get(address);

    if (existing) {
      return existing;
    }

    const contract = Erc20__factory.connect(address, this.wallet);

    const [name, symbol, decimals] = await Promise.all([
      contract.callStatic.name(),
      contract.callStatic.symbol(),
      contract.callStatic.decimals(),
    ]);

    const token = {
      address,
      name,
      symbol,
      decimals:
        typeof decimals === 'number'
          ? decimals
          : (decimals as BigNumber).toNumber(),
      contract,
    };

    this.logger.debug(
      lodash.omit(token, ['contract']),
      '[Finished] Loading token',
    );

    this.tokenCache.set(address, token);

    return token;
  }

  async getSourceToken(type: ChainConfigurationSourceType) {
    const foundToken = this.config.sources.find(
      (source) => source.type === type,
    );

    if (!foundToken) {
      throw new Error(`Could not find token with type "${type}"`);
    }

    return this.loadSourceToken(foundToken.address);
  }

  async getCheckableTokens(name?: string) {
    let foundTokens = this.config.sources.filter((source) => source.check);

    if (name) {
      foundTokens = foundTokens.filter((ft) => ft.name === name);
    }

    return Promise.all(
      foundTokens.map((ft) => this.loadSourceToken(ft.address)),
    );
  }

  async getReserveToken() {
    return this.getSourceToken('reserve');
  }

  async getNativeToken() {
    return this.getSourceToken('native');
  }

  async getStableToken() {
    return this.getSourceToken('stable');
  }

  async getTokenBalance(token: Token | SourceToken) {
    if (
      (token as SourceToken).type &&
      (token as SourceToken).type === 'native'
    ) {
      return this.wallet.getBalance();
    }

    return token.contract.balanceOf(this.wallet.address);
  }

  async getTokenBalanceNumber(token: Token | SourceToken) {
    const balance = await this.getTokenBalance(token);

    return ethers.utils.formatUnits(balance, token.decimals);
  }

  private async loadSourceToken(address: string) {
    this.logger.debug(
      {
        address,
      },
      '[Started] Loading source token',
    );

    const { sources } = this.config;

    const source = sources.find((source) => source.address === address);

    if (!source) {
      throw new Error(`Could not find source token with address "${address}"`);
    }

    const existing = this.sourceTokenCache.get(address);

    if (existing) {
      return existing;
    }

    const contract = Erc20__factory.connect(source.address, this.wallet);

    const symbol = await contract.callStatic.symbol();

    const token = {
      address: source.address,
      name: source.name,
      symbol,
      decimals: source.decimals,
      type: source.type,
      minimumLp: source.minimumLp,
      config: source,
      contract,
    };

    this.logger.debug(
      lodash.omit(token, ['config', 'contract']),
      '[Finished] Loading source token',
    );

    this.sourceTokenCache.set(source.address, token);

    return token as SourceToken;
  }
}
