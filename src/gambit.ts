#!/usr/bin/env node
import { Command } from 'commander';

import setupWallet from './commands/setupWallet.js';
import snipe from './commands/snipe.js';

const program = new Command();

program
  .command('snipe')
  .addHelpText(
    'after',
    `

Example interactive call:
./gambit snipe mainWallet arb camelot 0x522... --password sup3rS3cr3tP4ssw0rd

Example automated call:
./gambit snipe mainWallet arb camelot 0x522... --password=sup3rS3cr3tP4ssw0rd --totalSpend="0.01"
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
  .option('-p, --password <string>', 'Key file decryption password')
  .option('-s, --sourceToken <string>', 'Source token name to check')
  .action(snipe);

program
  .command('setup-wallet')
  .addHelpText(
    'after',
    `

Example call:
./gambit setup-wallet mainWallet sup3rS3cr3tP4ssw0rd 0x.... myL0ngS3cr3tK3yH3r3
`,
  )
  .description('Setup new wallet for Gambit')
  .argument(
    '<walletName>',
    'Name of the wallet file WITHOUT extension (ex: my-key)',
  )
  .argument('<password>', 'Password to encrypt key file with')
  .argument('<address>', 'Your wallet address (ex: 0x78...)')
  .argument('<secretKey>', 'Secret key associated to your wallet')
  .option('-f, --force [boolean]', 'Force existing file deletion', false)
  .action(
    async (
      walletName: string,
      password: string,
      address: string,
      secretKey: string,
      options: { force?: boolean },
    ) => {
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
