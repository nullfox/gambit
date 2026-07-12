import { existsSync } from 'fs';
import inquirer from 'inquirer';
import { join } from 'path';

import { WALLET_DIR, WALLET_EXTENSION_ENCRYPTED } from '../constants.js';

// Secrets passed as CLI arguments leak into shell history (`~/.bash_history`)
// and the process listing (`ps auxww`). These helpers keep them off argv by
// preferring an environment variable, then falling back to a hidden prompt.
// An explicit value (e.g. a `--password` flag) is still honoured for
// automation, but it is the least-preferred source and is discouraged.

const ENV = {
  PASSWORD: 'GAMBIT_PASSWORD',
  WALLET_KEY: 'GAMBIT_WALLET_KEY',
} as const;

const readEnv = (name: string) => {
  const value = process.env[name];

  return value && value.length > 0 ? value : undefined;
};

const promptHidden = async (message: string): Promise<string> => {
  const { value } = await inquirer.prompt<{ value: string }>([
    {
      type: 'password',
      name: 'value',
      mask: '*',
      message,
    },
  ]);

  return value;
};

export const walletIsEncrypted = (walletName: string) =>
  existsSync(join(WALLET_DIR, `${walletName}.${WALLET_EXTENSION_ENCRYPTED}`));

export const resolvePassword = async (
  explicit?: string,
  { confirm = false }: { confirm?: boolean } = {},
): Promise<string> => {
  const fromArgOrEnv = explicit || readEnv(ENV.PASSWORD);

  if (fromArgOrEnv) {
    return fromArgOrEnv;
  }

  const password = await promptHidden('Wallet password:');

  if (confirm) {
    const confirmation = await promptHidden('Confirm password:');

    if (password !== confirmation) {
      throw new Error('Passwords do not match');
    }
  }

  if (password.length === 0) {
    throw new Error('Password must not be empty');
  }

  return password;
};

export const resolveWalletKey = async (explicit?: string): Promise<string> => {
  const fromArgOrEnv = explicit || readEnv(ENV.WALLET_KEY);

  if (fromArgOrEnv) {
    return fromArgOrEnv;
  }

  const key = await promptHidden('Wallet private key:');

  if (key.length === 0) {
    throw new Error('Private key must not be empty');
  }

  return key;
};
