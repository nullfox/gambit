import { createCipheriv, createHash, randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';

import { decrypt, encrypt } from '../src/services/crypt.js';

// Build a legacy (pre-scrypt) payload the way the old code did: an unsalted
// MD5 of the password as the AES key, layout [iv][ciphertext].
const legacyEncrypt = (data: string, password: string) => {
  const key =
    password.length === 32
      ? password
      : createHash('md5').update(password).digest('hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(data), cipher.final()]);
};

describe('crypt (scrypt)', () => {
  it('round-trips data with the correct password', () => {
    const secret = JSON.stringify({ address: '0xabc', key: 'deadbeef' });
    const out = encrypt(secret, 'sup3rS3cr3t');

    expect(decrypt(out, 'sup3rS3cr3t').toString('utf-8')).toBe(secret);
  });

  it('stamps the GMBTv1 magic prefix on new payloads', () => {
    const out = encrypt('hello', 'pw');

    expect(out.subarray(0, 6).toString('utf-8')).toBe('GMBTv1');
  });

  it('uses a random per-file salt (same input encrypts differently)', () => {
    const a = encrypt('hello', 'pw');
    const b = encrypt('hello', 'pw');

    expect(a.equals(b)).toBe(false);
    // ...but both still decrypt back to the same plaintext.
    expect(decrypt(a, 'pw').toString('utf-8')).toBe('hello');
    expect(decrypt(b, 'pw').toString('utf-8')).toBe('hello');
  });

  it('rejects the wrong password', () => {
    const out = encrypt('hello', 'right');

    expect(() => decrypt(out, 'wrong')).toThrow();
  });
});

describe('crypt backward compatibility', () => {
  it('still decrypts legacy MD5-derived payloads', () => {
    const legacy = legacyEncrypt('legacy secret', 'my-password');

    expect(decrypt(legacy, 'my-password').toString('utf-8')).toBe(
      'legacy secret',
    );
  });
});
