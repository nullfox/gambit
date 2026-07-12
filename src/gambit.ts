#!/usr/bin/env node
import { Command } from 'commander';

import setupWallet from './commands/setupWallet.js';
import snipe from './commands/snipe.js';
import {
  resolvePassword,
  resolveWalletKey,
  walletIsEncrypted,
} from './services/prompt.js';

const program = new Command();

program
  .command('snipe')
  .addHelpText(
    'after',
    `

The wallet password is prompted for (hidden) when the wallet is
encrypted. To run non-interactively, set GAMBIT_PASSWORD in the
environment instead of passing --password (which leaks into shell
history and the process listing).

Example interactive call:
./gambit snipe mainWallet arb camelot 0x522...

Example automated call:
GAMBIT_PASSWORD=... ./gambit snipe mainWallet arb camelot 0x522... --totalSpend="0.01"
`,
  )
  .description('Snipe token LP')
  .argument(
    '<walletName>',
    'Name of the wallet file WITHOUT extension (ex: my-key)',
  )
  .argument('<chain>', 'Chain configuration to use (ex: wallet_bsc)')
  .argument('<dex>', 'DEX name to use (ex: pancake)')
  .argument(
    '<token>',
    'Target token to snipe (ex: 0x522d0f9f3eff479a5b256bb1c1108f47b8e1a153)',
  )
  .option(
    '-t, --totalSpend <number>',
    'Total amount of reserve token to spend',
    parseFloat,
  )
  .option(
    '-l, --loopSpend <number>',
    'Amount of reserve token to spend for each loop',
    parseFloat,
  )
  .option('-g, --forceGas <number>', 'Amount of gas to spend', parseFloat)
  .option(
    '-p, --password <string>',
    'Key file decryption password (discouraged — prefer the prompt or GAMBIT_PASSWORD)',
  )
  .option('-s, --sourceToken <string>', 'Source token name to check')
  .action(
    async (
      walletName: string,
      chain: string,
      dex: string,
      token: string,
      options: {
        password?: string;
        totalSpend?: number;
        loopSpend?: number;
        forceGas?: number;
        sourceToken?: string;
      },
    ) => {
      // Only encrypted wallets need a password; raw .json wallets do not.
      const password = walletIsEncrypted(walletName)
        ? await resolvePassword(options.password)
        : undefined;

      return snipe(walletName, chain, dex, token, { ...options, password });
    },
  );

program
  .command('setup-wallet')
  .addHelpText(
    'after',
    `

The private key and encryption password are prompted for (hidden) so
they never touch argv. For automation, set GAMBIT_WALLET_KEY and
GAMBIT_PASSWORD in the environment instead.

Example call:
./gambit setup-wallet mainWallet 0x....
`,
  )
  .description('Setup new wallet for Gambit')
  .argument(
    '<walletName>',
    'Name of the wallet file WITHOUT extension (ex: my-key)',
  )
  .argument('<address>', 'Your wallet address (ex: 0x78...)')
  .option('-f, --force [boolean]', 'Force existing file deletion', false)
  .action(
    async (
      walletName: string,
      address: string,
      options: { force?: boolean },
    ) => {
      const secretKey = await resolveWalletKey();
      const password = await resolvePassword(undefined, { confirm: true });

      const path = await setupWallet(
        walletName,
        password,
        address,
        secretKey,
        options.force,
      );

      console.log(`Encrypted wallet file to path: ${path}`);
    },
  );

program.parse();
