import {
  createReadStream,
  createWriteStream,
  existsSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { Transform, TransformCallback, TransformOptions } from 'stream';
import { pipeline } from 'stream/promises';

import {
  WALLET_DIR,
  WALLET_EXTENSION_ENCRYPTED,
  WALLET_EXTENSION_RAW,
} from '../constants.js';
import * as crypt from '../services/crypt.js';

class DecryptStream extends Transform {
  protected password: string;

  constructor({ password, ...rest }: TransformOptions & { password: string }) {
    super(rest);

    this.password = password;
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    // const message = chunk.toString('ascii');

    callback(null, crypt.decrypt(chunk, this.password));
  }
}

const decrypt = (walletName: string, password: string, force?: boolean) => {
  const inPath = join(
    WALLET_DIR,
    `${walletName}.${WALLET_EXTENSION_ENCRYPTED}`,
  );
  const outPath = join(WALLET_DIR, `${walletName}.${WALLET_EXTENSION_RAW}`);

  if (!existsSync(inPath)) {
    throw new Error(
      `Could not open file "${inPath}" - please ensure it exists`,
    );
  }

  if (existsSync(outPath)) {
    if (!force) {
      // throw new Error(`Output file "${outPath}" - already exists`);
    }

    unlinkSync(outPath);
  }

  return pipeline(
    createReadStream(inPath),
    new DecryptStream({ password }),
    createWriteStream(outPath),
  )
    .then(() => unlinkSync(inPath))
    .then(() => outPath);
};

export default decrypt;
