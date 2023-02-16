type Router = import('./typechain/index').Router;
type RouterArbCamelot = import('./typechain/index').Router_arb_camelot;
type Erc20 = import('./typechain/index').Erc20;

type ChainConfigurationSourceType = 'native' | 'stable' | 'reserve';

interface ChainConfigurationSource {
  name: string;
  decimals: number;
  address: string;
  minimumLp: number;
  totalSpend: number;
  spendPerLoop?: number;
  check: boolean;
  approve: boolean;
  type: ChainConfigurationSourceType;
}

interface ChainConfigurationDex {
  name: string;
  router: string;
  factory: string;
}

interface ChainConfiguration {
  name: string;
  networkId: number;
  chainId: number;
  rpc: string[];
  wss?: string;
  dex: string;
  explorer: string;

  buy: {
    slippage: number;
    gwei: number;
    gas: number;
  };

  sell: {
    slippage: number;
    gwei: number;
    gas: number;
  };

  misc: {
    loopTimeInSeconds: number;
    refreshInteractive: boolean;
    interactiveRefreshInSeconds: number;
    approveTo: boolean;
    maxErrorCount: number;
  };

  dexes: ChainConfigurationDex[];

  sources: ChainConfigurationSource[];
}

interface WalletConfig {
  address: string;
  key: string;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  contract: Erc20;
}

interface SourceToken extends Token {
  type: ChainConfiguration['sources'][0]['type'];
  minimumLp: number;
  config: ChainConfiguration['sources'][0];
  contract: Erc20;
}

type SourceTokenIdentifier = SourceToken | 'native' | 'stable' | string;
