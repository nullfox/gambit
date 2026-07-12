# Gambit — Technical Documentation

> **LP Sniper** — a command‑line tool for buying (and selling) tokens on EVM‑compatible
> decentralized exchanges the moment liquidity is added to a trading pair.

---

## Table of Contents

1. [What Gambit Is](#1-what-gambit-is)
2. [Core Concepts & Terminology](#2-core-concepts--terminology)
3. [Unique / Notable Features](#3-unique--notable-features)
4. [Technology Stack](#4-technology-stack)
5. [Project Layout](#5-project-layout)
6. [Architecture](#6-architecture)
7. [Execution Flow](#7-execution-flow)
8. [Configuration System](#8-configuration-system)
9. [Wallet & Key Management](#9-wallet--key-management)
10. [The DEX Adapter Layer](#10-the-dex-adapter-layer)
11. [Trade Mechanics (Buy / Sell / Gas / Slippage)](#11-trade-mechanics-buy--sell--gas--slippage)
12. [Commands Reference](#12-commands-reference)
13. [Supported Chains & DEXes](#13-supported-chains--dexes)
14. [Build & Run](#14-build--run)
15. [Design Observations, Gaps & Risks](#15-design-observations-gaps--risks)

---

## 1. What Gambit Is

Gambit is a **liquidity‑pool (LP) sniping bot** written in TypeScript and run from the
terminal. Its job is narrow and specific:

- You give it a **target token address**, a **chain**, and a **DEX**.
- It repeatedly polls the DEX's factory contract looking for a trading pair between that
  target token and one of your configured **source tokens** (the coin you're willing to
  spend — e.g. native ETH/BNB, or a stablecoin like USDC/USDT/BUSD).
- The moment a pair exists **and** has liquidity above a configurable threshold, Gambit
  either fires off a buy automatically or drops you into an interactive trading shell.

The term *"sniping"* refers to being among the first buyers when a token's liquidity
goes live — a common (and high‑risk) DeFi trading tactic. Gambit automates the detection,
the routing, the gas/slippage math, and the swap transaction so a human doesn't have to
watch a block explorer and click fast.

It is a **single‑user CLI utility**, not a hosted service. Everything runs locally against
public RPC endpoints, and your private key never leaves your machine.

---

## 2. Core Concepts & Terminology

| Term | Meaning in Gambit |
|------|-------------------|
| **Target token** | The token you want to buy (passed on the command line as an address). |
| **Source token** | A token you spend to buy the target. Declared in chain config with a `type` of `native`, `stable`, or `reserve`. |
| **Native token** | The chain's gas coin (ETH on Arbitrum, BNB on BSC, AVAX on Avalanche). Handled specially because swaps use `...ETHForTokens...` router methods and send `value` instead of an ERC‑20 transfer. |
| **Checkable token** | A source token flagged `check = true`. Gambit tries to find a pair against *each* of these and picks the one with the most liquidity. |
| **Pair** | A DEX liquidity pool contract (Uniswap‑V2‑style) holding reserves of two tokens. |
| **Minimum LP** | Per‑source‑token liquidity floor (`minimumLp`). A pair is ignored until it holds at least this much of the source token. |
| **DEX adapter** | A small class that knows the exact router/factory call signature for a given exchange (they differ subtly between forks). |

---

## 3. Unique / Notable Features

- **Config‑driven, multi‑chain, multi‑DEX.** Chains and exchanges are declared entirely in
  TOML files under `configs/`. Adding a new EVM chain or a new Uniswap‑V2 fork is usually
  just config + (occasionally) a new adapter — no core rewrite.

- **Adapter pattern for DEX quirks.** Most V2 forks share the same router ABI, but some
  don't. Camelot's router adds a **referrer address** argument to every swap; Glacier
  (Trader Joe / Velodrome‑style on Avalanche) adds a **`stable` boolean** to `getPair` for
  stable‑vs‑volatile pools. Gambit isolates these differences behind pluggable adapters
  instead of branching everywhere.

- **"Most liquid pair wins" auto‑routing.** When a target token can be paired against
  several source tokens (native, USDC, USDT…), Gambit checks all of them in parallel and
  automatically trades against whichever pool has the deepest liquidity.

- **Three operating modes from one command** (chosen by config/flags, see [§7](#7-execution-flow)):
  - *Interactive* — a live, auto‑refreshing dashboard where you type `b1`, `s50`, `sa`.
  - *Automatic single‑shot* — buy the whole `totalSpend` the instant a pair appears.
  - *Automatic looped/DCA* — spend `spendPerLoop` each tick until `totalSpend` is reached.

- **Encrypted local wallets.** Private keys are stored AES‑256‑CBC encrypted (`.crypt`
  files) and only decrypted in memory at runtime with a password you supply.

- **Fee‑on‑transfer aware.** All swaps use the
  `...SupportingFeeOnTransferTokens` router variants, so tokens that tax transfers (very
  common among freshly launched "snipe" targets) don't cause reverts.

- **Gas safety rails.** Gas is estimated live, then multiplied by a safety factor, but
  clamped to never exceed a percentage of the block gas limit — protecting against runaway
  gas on a misbehaving contract.

- **Price‑impact readout.** The interactive shell shows the price impact of selling your
  current holdings, so you can see how much you'd move the market before you do.

- **Typed contract bindings.** All contract calls go through TypeChain‑generated,
  fully‑typed wrappers (`src/typechain/`) rather than stringly‑typed ABI calls.

---

## 4. Technology Stack

| Concern | Choice |
|---------|--------|
| Language | **TypeScript** (ES modules, `"type": "module"`) targeting Node.js |
| Blockchain SDK | **ethers.js v5** (`@ethersproject/*`) |
| Typed contracts | **TypeChain** (`@typechain/ethers-v5`) — generated code in `src/typechain/` |
| CLI framework | **commander** |
| Interactive prompts | Node `readline` (plus `inquirer` / `log-update` as deps) |
| Config format | **TOML** (`toml` parser) |
| Logging | **pino** (+ `pino-pretty`) |
| Crypto | Node `crypto` (AES‑256‑CBC) |
| Utilities | `lodash` |
| (Present but unused/optional) | `express`, `lowdb`, `node-notifier` |
| Tooling | ESLint, Prettier (with import‑sort plugin), `tsc` |

The binary entrypoint is `gambit.js`, a tiny shim that imports the compiled
`lib/gambit.js`. Source compiles from `src/` → `lib/` via `tsc`.

> Note: `express`, `lowdb`, and `node-notifier` are declared as dependencies but are not
> wired into the current code paths. The desktop‑notification calls (`node-notifier`) are
> present but commented out throughout `snipe.ts`, suggesting a planned/disabled feature.

---

## 5. Project Layout

```
gambit/
├── gambit.js                  # Executable shim → imports compiled lib/gambit.js
├── package.json               # Deps, "gambit" bin, build script (tsc)
├── tsconfig.json              # ESM + TypeChain-friendly TS config
├── README.md                  # Quickstart
│
├── configs/
│   ├── chains/                # One TOML per chain
│   │   ├── arb.toml           #   Arbitrum
│   │   ├── avax.toml          #   Avalanche
│   │   └── bsc.toml           #   BNB Smart Chain
│   └── abis/                  # Raw JSON ABIs (source for TypeChain + runtime)
│       ├── erc20.json
│       ├── factory.json
│       ├── factory_avax_glacier.json
│       ├── pair.json
│       ├── router.json
│       └── router_arb_camelot.json
│
├── wallets/
│   └── template.json          # Shape of a raw wallet file ({ address, key })
│
└── src/
    ├── gambit.ts              # CLI definition (commander) — entrypoint
    ├── constants.ts           # Paths, algorithm names, gas tuning constants
    ├── global.d.ts            # Ambient types: ChainConfiguration, Token, etc.
    │
    ├── commands/
    │   ├── snipe.ts           # The main command: find pair → trade
    │   ├── setupWallet.ts     # Create an encrypted wallet file
    │   ├── encrypt.ts         # Stream-encrypt an existing raw wallet
    │   └── decrypt.ts         # Stream-decrypt back to raw
    │
    ├── libs/
    │   ├── sniper.ts          # Orchestrator: wallet + chain + pair discovery
    │   ├── chain.ts           # Chain config, RPC providers, token loading/caching
    │   ├── dex.ts             # Router/factory wiring + factory adapter selection
    │   ├── pair.ts            # A live pool: pricing, buy/sell, gas, slippage, approvals
    │   └── dex/               # Per-DEX adapters
    │       ├── primary.ts     #   Standard Uniswap-V2 router/factory
    │       ├── camelot.ts     #   Camelot (adds referrer arg)
    │       └── glacier.ts     #   Glacier (adds stable-pool flag)
    │
    ├── services/
    │   └── crypt.ts           # AES-256-CBC encrypt/decrypt helpers
    │
    └── typechain/             # TypeChain-generated typed contract bindings + factories
```

---

## 6. Architecture

Gambit is layered. Each layer has a single responsibility and hands typed objects to the
one above it.

```
        CLI (commander)                       src/gambit.ts
              │  parses args/flags, dispatches
              ▼
        Command handler                        src/commands/snipe.ts
              │  drives the whole run, owns the trading loop / shell
              ▼
        Sniper (orchestrator)                  src/libs/sniper.ts
              │  loads wallet, builds Chain, discovers the best Pair
              ▼
   ┌──────────┴───────────┐
   ▼                      ▼
 Chain                   Dex                   src/libs/chain.ts, dex.ts
 - RPC providers         - router + factory
 - token cache           - factory adapter
 - source tokens         - getPair()
   │                      │
   └──────────┬───────────┘
              ▼
            Pair                               src/libs/pair.ts
              │  pricing, price impact, buy(), sell(), approvals, gas math
              ▼
        DEX pair adapter                       src/libs/dex/{primary,camelot,glacier}.ts
              │  exact router call signature for this exchange
              ▼
        TypeChain contract wrappers            src/typechain/*
              │
              ▼
        ethers.js  →  JSON-RPC  →  the chain
```

**Key classes and their jobs:**

- **`Sniper`** (`libs/sniper.ts`) — top‑level orchestrator. It loads/decrypts the wallet,
  constructs a `Chain`, exposes `findOperatingPair()` (the discovery logic), and gathers
  the numbers shown in the interactive shell. `findOperatingPair()` fetches candidate pairs
  for every checkable source token *in parallel* (`Promise.all`), filters out pools below
  their `minimumLp`, and returns the one with the highest liquidity.

- **`Chain`** (`libs/chain.ts`) — loads a chain's TOML config, spins up one
  `JsonRpcProvider` per RPC URL, connects the wallet to the first one, and builds the `Dex`.
  It also resolves and **caches** token metadata (name/symbol/decimals) and source‑token
  objects so repeated lookups don't re‑hit the chain.

- **`Dex`** (`libs/dex.ts`) — lazily connects the correct **router** and **factory**
  contracts for the selected exchange (using the right TypeChain factory per DEX), and
  produces a `Pair` via `getPair()`. Factory quirks are delegated to a *factory adapter*.

- **`Pair`** (`libs/pair.ts`) — the workhorse. Wraps a specific pool contract and knows how
  to: read reserves and prices, compute price impact, approve tokens (idempotently, to
  max‑uint), estimate and clamp gas, apply slippage, and execute `buy`/`sell`/`sellPercent`.
  It delegates the actual router call to a *pair adapter* based on the DEX name.

- **DEX adapters** (`libs/dex/*`) — thin classes that produce
  `{ estimate, execute }` closures for each swap type (`buy`, `buyNative`, `sell`,
  `sellNative`). They exist purely to encapsulate per‑DEX call‑signature differences.

---

## 7. Execution Flow

Here is the end‑to‑end path of a `snipe` run.

### Step 1 — CLI parse
`gambit.ts` (via commander) parses `walletName chain dex token` plus options
(`--password`, `--totalSpend`, `--loopSpend`, `--forceGas`, `--sourceToken`) and calls the
`snipe` handler.

### Step 2 — Bootstrap
`snipe.ts` constructs a `Sniper`, which:
1. Loads the wallet file — `.crypt` (decrypted with `--password`) or raw `.json`.
2. Builds the `Chain` from `configs/chains/<chain>.toml`, creating RPC providers and
   connecting the wallet.
3. Selects the `Dex` (CLI `dex` arg overrides the config default) and validates it exists
   in the `[[dexes]]` list.

### Step 3 — Resolve tokens
Gambit loads the **target token** metadata from its address, and gathers the
**checkable source tokens** (optionally narrowed to just `--sourceToken`).

### Step 4 — Pair discovery loop
`findPairLoop()` calls `sniper.findOperatingPair()` every **5 seconds** until a qualifying
pair appears:
- For each checkable source token, ask the factory for the pair address.
- Skip non‑existent pairs (zero address) and pairs below `minimumLp`.
- Among survivors, pick the **highest‑liquidity** pair.

### Step 5 — Choose an operating mode
Once a pair is found, `snipe.ts` branches on config/flags:

```
resolvedTotalSpend = --totalSpend flag ?? source.totalSpend (from TOML)

if  resolvedTotalSpend > 0  AND  no spendPerLoop
        → AUTOMATIC SINGLE-SHOT: pair.buy(resolvedTotalSpend) once, print receipt.

elif  totalSpend > 0  AND  spendPerLoop > 0
        → AUTOMATIC LOOP (DCA): while totalSpent < totalSpend:
              pair.buy(spendPerLoop); totalSpent += spendPerLoop;
              sleep(loopTimeInSeconds)
          Aborts after maxErrorCount consecutive failures.

else
        → INTERACTIVE SHELL.
```

### Step 6a — Interactive shell
`interactiveShell()` clears the screen and prints a live panel: block number, price,
your balances, the value of your holdings in the source token, and the **price impact** of
selling them. If `refreshInteractive` is set, it re‑renders every
`interactiveRefreshInSeconds`. You then type a command:

| Input | Action |
|-------|--------|
| `b<number>` | Buy — spend `<number>` of the source token. |
| `s<number>` | Sell `<number>%` of your target‑token holdings. |
| `sa` | Sell **all** (100%). |

Input is validated against a regex; bad input re‑prompts. Errors are counted and the
process exits once `maxErrorCount` is hit.

### Step 6b — A trade (`pair.buy` / `pair.sell`)
For any buy/sell (from either automatic mode or the shell):
1. Parse the human amount into base units using the token's decimals.
2. **Approve** the router to spend the token (only if allowance is 0; approves max‑uint).
3. Quote `getAmountsOut` and subtract configured **slippage** → `amountOutMin`.
4. Pick the correct adapter method: native vs ERC‑20 source token.
5. **Estimate gas**, clamp it to ≤ `GAS_LIMIT_THRESHOLD`% of the block gas limit, then
   multiply by `GAS_MULTIPLIER` for headroom.
6. Fetch the pending nonce, send the swap with the configured `gwei` gas price, and
   `await tx.wait()` for the receipt.

---

## 8. Configuration System

Each chain is a self‑contained TOML file in `configs/chains/`. Structure (typed by
`ChainConfiguration` in `global.d.ts`):

```toml
name       = "arb"                 # logical name (matches the CLI <chain> arg / filename)
networkId  = 42161
chainId    = 42161
rpc        = ["https://arb1.arbitrum.io/rpc"]   # one provider is created per URL
dex        = "camelot"             # default DEX if none passed on CLI
explorer   = "https://arbiscan.io" # used to build tx links

[buy]                              # buy-side trade params
slippage   = 1                     # percent
gwei       = 3                     # gas price
gas        = 1469174               # gas limit hint (used as fallback)

[sell]                             # sell-side params (often higher slippage)
slippage   = 25
gwei       = 3
gas        = 1469174

[misc]
loopTimeInSeconds           = 1    # delay between DCA loop buys
refreshInteractive          = true # auto-refresh the shell?
interactiveRefreshInSeconds = 10
approveTo                   = false
maxErrorCount               = 3    # consecutive-error kill switch

[[dexes]]                          # repeatable — one block per exchange
name    = "camelot"
router  = "0xc873fecbd354f5a56e00e710b90ef4201db2448d"
factory = "0x6EcCab422D763aC031210895C81787E87B43A652"

[[sources]]                        # repeatable — one per spendable token
name        = "AETH"
decimals    = 18
address     = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
minimumLp   = 10                   # skip pools below this much source-token liquidity
totalSpend  = 0                    # >0 ⇒ automatic mode
# spendPerLoop = 0                 # uncomment ⇒ DCA loop mode
check       = true                 # include in pair discovery
approve     = true
type        = "native"             # native | stable | reserve
```

Notable config‑driven behaviors:
- **`type = "native"`** switches the trade path to the `...ETHForTokens...` router methods
  and sends `value` on the transaction instead of doing an ERC‑20 approve+transfer.
- **`type = "stable"`** is used by the Glacier adapter to request the *stable* variant of a
  pool from the factory.
- **`check`** controls which source tokens participate in pair discovery.
- **`totalSpend` / `spendPerLoop`** determine the operating mode (see [§7](#7-execution-flow)).
- If a DEX's `factory` address is omitted, `Dex` will read it from the router via
  `router.factory()`.

The `configs/abis/` directory holds the raw contract ABIs that back both the TypeChain
codegen and the runtime contract instances.

---

## 9. Wallet & Key Management

Wallets live in `wallets/` in one of two forms:

- **Raw** `.json` — `{ "address": "0x…", "key": "<private key>" }` (see `wallets/template.json`).
- **Encrypted** `.crypt` — AES‑256‑CBC ciphertext of that JSON.

The crypto (`services/crypt.ts`):
- Derives the 32‑byte key from your password. If the password is exactly 32 chars it's used
  verbatim; otherwise it's hashed with **MD5→hex** (which conveniently yields 32 chars).
- Prepends a random 16‑byte **IV** to the ciphertext so each encryption is unique.

At runtime, `Sniper.getWallet()` reads the file, decrypts it in memory if a `--password`
was supplied, and constructs an ethers `Wallet` from the private key (never persisting the
plaintext). Wallet‑related commands:

- **`setup-wallet`** — writes a new encrypted `.crypt` directly from CLI args.
- **`encrypt` / `decrypt`** — stream‑based conversion between raw and encrypted forms
  (Node `Transform` streams). *Note: these two handlers exist in `src/commands/` but are
  not currently registered as commands in `gambit.ts`.*

> **Security note:** MD5 key derivation and passing secrets as CLI arguments (which land in
> shell history / process listings) are weak points — see [§15](#15-design-observations-gaps--risks).

---

## 10. The DEX Adapter Layer

Because virtually every DEX here is a Uniswap‑V2 fork, they share ~95% of their interface —
but the last 5% differs enough to break a naive one‑size call. Gambit solves this with two
kinds of adapters:

**Factory adapters** (`getPair` differences), selected in `dex.ts`:
- `PrimaryFactory` — standard `getPair(tokenA, tokenB)`.
- `GlacierFactory` — `getPair(tokenA, tokenB, stable)`; the `stable` flag is derived from
  whether either token is a `type = "stable"` source.

**Pair (swap) adapters** (router call‑signature differences), selected in `pair.ts`:
- `Primary` — the standard Uniswap‑V2 router. Provides
  `buy`, `buyNative`, `sell`, `sellNative`, each returning an `{ estimate, execute }` pair
  that calls the appropriate `swapExact…SupportingFeeOnTransferTokens` method.
- `Camelot` — same set, but every swap takes an extra **referrer address** argument
  (passed as the zero address).
- `Glacier` — Avalanche variant (present for completeness alongside its factory adapter).

The selection is by DEX **name**:

```ts
// pair.ts
const pairAdapters = { camelot: Camelot };
// anything not in the map → Primary (the default V2 behavior)
```

This is the project's main extension point: to support a new fork with a slightly different
router, you add an adapter and register its name.

---

## 11. Trade Mechanics (Buy / Sell / Gas / Slippage)

All implemented in `Pair` (`libs/pair.ts`).

**Pricing.** `getAmountsOut` on the router gives the quote for a path
`[source, target]` (buy) or `[target, source]` (sell). `getPrices()` also reads raw
reserves to compute spot price and its inverse.

**Slippage.** `amountOutMin = quote − quote * slippage/100`, using the `[buy]`/`[sell]`
slippage from config. Sell slippage is typically set much higher (e.g. 25–40%) because
freshly launched tokens are volatile and often taxed.

**Approvals.** Before spending an ERC‑20, `approveSourceToken()` / `approveTargetToken()`
check the current allowance and, if zero, approve the router for **max‑uint256** (a one‑time
unlimited approval). Native‑token buys skip the approve entirely.

**Fee‑on‑transfer.** Every swap uses the `...SupportingFeeOnTransferTokens` router variant,
tolerating tokens that tax transfers.

**Gas strategy** (the `buy`/`sell` methods):
1. `estimateGas` for the specific swap.
2. Compute a ceiling = `GAS_LIMIT_THRESHOLD` (60) % of the current block's gas limit, with
   sane fallbacks (floor 1.5M, cap 8M if the block reports something odd).
3. If the estimate exceeds the ceiling, clamp to the ceiling.
4. Multiply the result by `GAS_MULTIPLIER` (1.4) for headroom.
5. Gas **price** comes from config (`gwei`); nonce is fetched as `pending`.

These constants live in `src/constants.ts`. `BP_DIVISOR` (10000) is used for basis‑point
math so percentages can be applied with integer‑safe BigNumber arithmetic.

**Selling by percentage.** `sellPercent(p)` reads your live target‑token balance and sells
`p%` of it — this is what powers the shell's `s50` and `sa` commands.

---

## 12. Commands Reference

Run `./gambit.js` (or `./gambit.js <cmd> --help`) to see usage. Registered commands:

### `snipe`
```
./gambit.js snipe <walletName> <chain> <dex> <token> [options]
```
| Arg / Option | Meaning |
|--------------|---------|
| `<walletName>` | Wallet file name **without** extension (e.g. `mainWallet`). |
| `<chain>` | Chain config to use (e.g. `arb`, `bsc`, `avax`). |
| `<dex>` | DEX to trade on (e.g. `camelot`, `pancake`). |
| `<token>` | Target token **address**. |
| `-t, --totalSpend <n>` | Total source‑token amount to spend (triggers automatic mode). |
| `-l, --loopSpend <n>` | Amount per loop for DCA mode. |
| `-g, --forceGas <n>` | Override gas amount. |
| `-p, --password <s>` | Decryption password for an encrypted wallet. |
| `-s, --sourceToken <s>` | Restrict discovery to one named source token. |

Examples:
```bash
# Interactive
./gambit.js snipe mainWallet arb camelot 0x522... --password sup3rS3cr3t

# Automatic (buy 0.01 immediately once a pair appears)
./gambit.js snipe mainWallet arb camelot 0x522... --password=sup3rS3cr3t --totalSpend="0.01"
```

### `setup-wallet`
```
./gambit.js setup-wallet <walletName> <password> <address> <secretKey> [-f]
```
Encrypts `{ address, key }` into `wallets/<walletName>.crypt`. `-f/--force` overwrites an
existing file.

> `encrypt` and `decrypt` handlers exist in code but are **not wired into the CLI**; only
> `snipe` and `setup-wallet` are registered in `gambit.ts`.

---

## 13. Supported Chains & DEXes

Ships with three chain configs (`configs/chains/`):

| Chain | `name` | Chain ID | DEXes configured |
|-------|--------|----------|------------------|
| BNB Smart Chain | `bsc` | 56 | `pancake`, `apebsc` |
| Arbitrum | `arb` | 42161 | `camelot`, `sushi_arb`, `lizard`, `alienfi` |
| Avalanche | `avax` | 43114 | (Glacier + others per its TOML) |

Per the README, `alienfi` is marked *untested*. `camelot` (Arbitrum) and `glacier`
(Avalanche) are the two exchanges with dedicated adapters; everything else runs through the
standard `Primary` adapter.

Adding a chain = drop in a new TOML. Adding a standard V2 DEX = add a `[[dexes]]` block.
Adding a *non‑standard* DEX = also add an adapter in `libs/dex/` and register it.

---

## 14. Build & Run

```bash
# 1. Install dependencies
yarn

# 2. Compile TypeScript (src/ → lib/)
yarn build

# 3. Create an encrypted wallet
./gambit.js setup-wallet mainWallet <password> 0xYourAddress <yourPrivateKey>

# 4. Snipe
./gambit.js snipe mainWallet arb camelot 0xTargetToken --password <password>
```

- Node ESM project (`"type": "module"`); the `gambit.js` shim runs the compiled output.
- `LOG_LEVEL` env var controls pino verbosity (defaults to `warn`).
- `package.json`'s `test` script is a placeholder — there is **no test suite** yet.

---

## 15. Design Observations, Gaps & Risks

A candid read of the current state, useful for anyone extending it:

**Strengths**
- Clean layering (CLI → Sniper → Chain/Dex → Pair → adapters → TypeChain) with clear
  single‑responsibility boundaries.
- Config‑as‑data makes onboarding new chains/DEXes cheap.
- Typed contract calls throughout reduce a whole class of ABI mistakes.
- Thoughtful gas clamping and fee‑on‑transfer support show real‑world DeFi awareness.

**Gaps / rough edges**
- **No tests.** The `test` script is a stub.
- **Dead/disabled code.** `node-notifier` calls are commented out; `express`, `lowdb`,
  `node-notifier` are unused deps; `encrypt`/`decrypt` commands are implemented but not
  registered; a couple of pricing/caching helpers in `pair.ts`/`dex.ts` are commented out.
- **`console.log`/`console.dir` debugging** remains in hot paths (e.g. the `SELL` dump and
  allowance logs in `primary.ts`), which will clutter output.
- **Deadlines use `Date.now()`** for the swap deadline — fine, but worth noting it's wall
  clock, not block time.

**Security considerations**
- **MD5** key derivation for wallet encryption is weak; a KDF like scrypt/PBKDF2/argon2
  would be far stronger.
- **Passwords as CLI args** leak into shell history and process listings.
- **Unlimited (max‑uint) approvals** are convenient but grant the router permanent spend
  rights on your tokens.
- **Sniping itself is high‑risk**: new tokens are frequently scams/honeypots; high sell
  slippage settings can mask predatory tokenomics. This tool automates *speed*, not *safety*.

---

*This document reflects the state of the codebase on the `claude/project-documentation-v6x2on`
branch. Line‑level behavior described above is drawn directly from `src/` and `configs/`.*
