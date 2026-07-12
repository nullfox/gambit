# Changelog

All notable changes to this project are documented here. This project loosely
follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — 2026 modernization pass

A focused pass hardening the security surface, adding test coverage, and
trimming dead code, without changing the core execution design.

### Added

- **Test suite (vitest).** Unit tests for the pure execution logic — slippage
  tolerance, gas normalization / ceiling / multiplier and their basis-point
  integer-safety, DEX adapter selection, and the crypt round-trip (including
  legacy-format decryption). Run with `npm test`.
- **CI.** GitHub Actions workflow running `build` + `test` on push and PRs.
- **`src/libs/execution.ts`.** The numeric trade-construction logic extracted
  into pure, dependency-free functions so it can be tested in isolation.
- **`--exact-approval` option.** Approves only the current trade's spend amount
  instead of an unlimited (max-uint) allowance. Default behaviour unchanged.
- **Base (L2) chain config.** `configs/chains/base.toml` with the official
  Uniswap V2 deployment on Base, usable with the existing Primary adapter.

### Changed

- **Key derivation is now scrypt** (memory-hard, per-file random salt) instead
  of an unsalted MD5. New wallet files carry a `GMBTv1` prefix; existing files
  still decrypt via a legacy fallback, so no re-encryption is required.
- **Secrets stay off the command line.** The wallet password and private key
  are prompted for (hidden) or read from `GAMBIT_PASSWORD` /
  `GAMBIT_WALLET_KEY` rather than passed as CLI arguments (which leak into
  shell history and the process listing). `setup-wallet`'s signature is now
  `setup-wallet <walletName> <address>`.

### Fixed

- **Gas ceiling never bound.** The block-gas ceiling was computed as ~60× the
  block gas limit rather than the intended 60%, so an over-estimate was never
  clamped. `blockGasCeiling` now takes the documented percentage of the
  normalized block gas limit.

### Removed

- Unused dependencies (`express`, `lowdb`, `node-notifier`, `log-update`).
- The unregistered `encrypt` / `decrypt` command handlers.
- Debug `console.log` / `console.dir` output on the buy/sell hot paths, a stray
  target-token approval in `Primary.buyNative`, and commented-out scaffolding.
