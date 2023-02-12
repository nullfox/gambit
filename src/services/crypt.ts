import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = {
  BLOCK_CIPHER: 'aes-256-cbc',
  IV_BYTE_LEN: 16,
  KEY_BYTE_LEN: 32,
};

export const generateKey = (password: string) =>
  password.length === ALGORITHM.KEY_BYTE_LEN
    ? password
    : createHash('md5').update(password).digest('hex');

export const encrypt = (data: string, password: string) => {
  const key = generateKey(password);

  const iv = randomBytes(ALGORITHM.IV_BYTE_LEN);
  const cipher = createCipheriv(
    ALGORITHM.BLOCK_CIPHER as 'aes-256-cbc',
    key,
    iv,
  );

  let encryptedMessage = cipher.update(data);
  encryptedMessage = Buffer.concat([encryptedMessage, cipher.final()]);

  return Buffer.concat([iv, encryptedMessage]);
};

export const decrypt = (encrypted: Buffer, password: string) => {
  const key = generateKey(password);

  const iv = encrypted.subarray(0, ALGORITHM.IV_BYTE_LEN);

  const message = encrypted.subarray(ALGORITHM.IV_BYTE_LEN);

  const decipher = createDecipheriv(
    ALGORITHM.BLOCK_CIPHER as 'aes-256-cbc',
    key,
    iv,
  );

  let data = decipher.update(Buffer.from(message));
  data = Buffer.concat([data, decipher.final()]);

  return data;
};
