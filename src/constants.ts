import { join } from 'path';

// Wallet things
export const WALLET_EXTENSION_RAW = 'json';
export const WALLET_EXTENSION_ENCRYPTED = 'crypt';
export const WALLET_ENCRYPTION_ALGO = 'aes-256-cbc';
export const WALLET_DIR = join(process.cwd(), 'wallets');

// Used for basis point calculations
export const BP_DIVISOR = 10000;

// As percent
export const GAS_LIMIT_THRESHOLD = 60;

// As percent
export const GAS_MULTIPLIER = 1.4;
