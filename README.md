![](https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/46e6b448-76a4-4f59-af76-185e8b320111/ddu2els-d7fd9241-0f1b-4392-b29c-b51686d918a9.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcLzQ2ZTZiNDQ4LTc2YTQtNGY1OS1hZjc2LTE4NWU4YjMyMDExMVwvZGR1MmVscy1kN2ZkOTI0MS0wZjFiLTQzOTItYjI5Yy1iNTE2ODZkOTE4YTkucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.LQF--3umAjkcAha3agv1kIcQYuUfk3ESLnVI6ppNIv4)

# Gambit
**LP Sniper**

### Install
**In terminal**

1. `yarn`
2. `yarn build`

### Usage
Run `./gambit.js` to view the available commands and formatting

Currently there are 2 commands available:
**setup-wallet**: Encrypts your wallet file containing your wallet address and private key. You can see the format and example usage by running `./gambit.js setup-wallet --help`

**snipe**: Runs the actual sniper with the given arguments, you can see the format and example usage by running `./gambit.js snipe --help`

### Chains/Dexes
Chain and dex configurations are stored in the `/configs` directory alongside any relevant ABI's

Currently the supported chains & dexes are:
**BSC**
- pancake
- apebsc

**ARB**
- sushi_arb
- camelot
- lizard
- alienfi (untested)
