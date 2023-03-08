import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { WALLET_DIR, WALLET_EXTENSION_ENCRYPTED } from '../constants.js';
import * as crypt from '../services/crypt.js';

const setupWallet = (
  walletName: string,
  password: string,
  address: string,
  key: string,
  force?: boolean,
) => {
  const outPath = join(
    WALLET_DIR,
    `${walletName}.${WALLET_EXTENSION_ENCRYPTED}`,
  );

  const payload = {
    address,
    key,
  };

  const buffer = crypt.encrypt(JSON.stringify(payload), password);

  if (!existsSync(WALLET_DIR)) {
    mkdirSync(WALLET_DIR);
  }

  if (existsSync(outPath)) {
    if (!force) {
      throw new Error(`Output file "${outPath}" - already exists`);
    }

    unlinkSync(outPath);
  }

  writeFileSync(outPath, buffer);

  return outPath;
};

export default setupWallet;
