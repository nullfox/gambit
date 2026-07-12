import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = {
  BLOCK_CIPHER: 'aes-256-cbc' as const,
  IV_BYTE_LEN: 16,
  KEY_BYTE_LEN: 32,
  SALT_BYTE_LEN: 16,
};

// Magic prefix stamped on scrypt-derived payloads so `decrypt` can tell the
// current format apart from legacy (MD5) files and pick the right KDF.
const SCRYPT_MAGIC = Buffer.from('GMBTv1', 'utf-8');

// scrypt cost parameters. N (CPU/memory cost) must be a power of two; these are
// the Node defaults and comfortably above the interactive-login minimum.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// Current key derivation: memory-hard scrypt with a per-file random salt.
export const generateKey = (password: string, salt: Buffer) =>
  scryptSync(password, salt, ALGORITHM.KEY_BYTE_LEN, SCRYPT_PARAMS);

// Legacy key derivation. Retained ONLY so wallets created before the scrypt
// migration can still be decrypted — it is never used to encrypt new data.
// MD5 is fast and unsalted, which is exactly why it was replaced.
const deriveLegacyKey = (password: string) =>
  password.length === ALGORITHM.KEY_BYTE_LEN
    ? password
    : createHash('md5').update(password).digest('hex');

export const encrypt = (data: string, password: string) => {
  const salt = randomBytes(ALGORITHM.SALT_BYTE_LEN);
  const key = generateKey(password, salt);

  const iv = randomBytes(ALGORITHM.IV_BYTE_LEN);
  const cipher = createCipheriv(ALGORITHM.BLOCK_CIPHER, key, iv);

  const encryptedMessage = Buffer.concat([cipher.update(data), cipher.final()]);

  // Layout: [magic][salt][iv][ciphertext]
  return Buffer.concat([SCRYPT_MAGIC, salt, iv, encryptedMessage]);
};

export const decrypt = (encrypted: Buffer, password: string) => {
  const isScrypt = encrypted
    .subarray(0, SCRYPT_MAGIC.length)
    .equals(SCRYPT_MAGIC);

  if (isScrypt) {
    let offset = SCRYPT_MAGIC.length;

    const salt = encrypted.subarray(offset, offset + ALGORITHM.SALT_BYTE_LEN);
    offset += ALGORITHM.SALT_BYTE_LEN;

    const iv = encrypted.subarray(offset, offset + ALGORITHM.IV_BYTE_LEN);
    offset += ALGORITHM.IV_BYTE_LEN;

    const message = encrypted.subarray(offset);

    const key = generateKey(password, salt);
    const decipher = createDecipheriv(ALGORITHM.BLOCK_CIPHER, key, iv);

    return Buffer.concat([decipher.update(message), decipher.final()]);
  }

  // Legacy layout: [iv][ciphertext] with an MD5-derived key.
  const key = deriveLegacyKey(password);

  const iv = encrypted.subarray(0, ALGORITHM.IV_BYTE_LEN);
  const message = encrypted.subarray(ALGORITHM.IV_BYTE_LEN);

  const decipher = createDecipheriv(ALGORITHM.BLOCK_CIPHER, key, iv);

  return Buffer.concat([decipher.update(message), decipher.final()]);
};
