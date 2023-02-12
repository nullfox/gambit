import { Wallet } from 'ethers';

import * as Typechain from '../typechain/index.js';
import Chain from './chain.js';
import Pair from './pair.js';

export default class Dex {
  private config: ChainConfigurationDex;
  private chain: Chain;
  private wallet: Wallet;

  private router: Typechain.Router | Typechain.Router_arb_camelot | undefined;
  private factory: Typechain.Factory | undefined;

  constructor(config: ChainConfigurationDex, chain: Chain, wallet: Wallet) {
    this.config = config;
    this.chain = chain;
    this.wallet = wallet;
  }

  getChain() {
    return this.chain;
  }

  getRouter() {
    if (!this.router) {
      if (this.config.name === 'camelot') {
        this.router = Typechain.Router_arb_camelot__factory.connect(
          this.config.router,
          this.wallet,
        );
      } else {
        this.router = Typechain.Router__factory.connect(
          this.config.router,
          this.wallet,
        );
      }
    }

    return this.router;
  }

  async getFactory() {
    if (!this.factory) {
      let factoryAddress = this.config.factory;

      if (!factoryAddress || factoryAddress.length === 0) {
        const router = this.getRouter();

        factoryAddress = await router.callStatic.factory();
      }

      this.factory = Typechain.Factory__factory.connect(
        factoryAddress,
        this.wallet,
      );
    }

    return this.factory;
  }

  getName() {
    return this.config.name;
  }

  async getPair(
    sourceToken: SourceToken,
    targetToken: Token,
  ): Promise<Pair | undefined> {
    const factory = await this.getFactory();

    /* const cacheKey = `${this.tokenAddress}::${token.address}`;
    const cachedPair = this.pairs.get(cacheKey);

    if (cachedPair) {
      return cachedPair;
    } */

    const address = await factory.callStatic.getPair(
      sourceToken.address,
      targetToken.address,
    );

    if (!address || address.startsWith('0x0000000')) {
      return undefined;
    }

    const pairContract = Typechain.Pair__factory.connect(address, this.wallet);

    const token0 = await pairContract.callStatic.token0();

    return new Pair(
      pairContract,
      sourceToken,
      targetToken,
      token0 === sourceToken.address,
      this,
      this.wallet,
    );
  }
}
