# BOT Chain 2048 contracts

BOT Chain port of monad-developers/2048-contracts, upstream commit
`11f36807e2afb64b9dcc104645666faa113431f1`.

See the root README for deployment, configuration, and test commands.
The Solidity game logic retains upstream MIT SPDX headers and author attribution.
Board helpers are internal/inlined; Bot2048 requires no linked library deployment.

From the project root:

```sh
npm run contracts:build
npm test
```

The original Foundry tests are retained in `test/`. To run them, install Foundry,
install forge-std at `contracts/lib/forge-std`, then run `forge test` from this directory.
