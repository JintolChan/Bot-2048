# BOT 2048

基于 [monad-developers/2048-contracts](https://github.com/monad-developers/2048-contracts) 的 BOT Chain 移植，包含完整 React 前端、钱包接入、合约、部署脚本和本地 EVM 集成测试。

前端使用 BOT Chain 官网的黑色、薄荷绿、细线框视觉语言。支持桌面键盘、WASD、方向按钮和手机滑动。

## 本地运行

需要 Node.js 24 和 npm。

```sh
npm ci
cp .env.example .env
npm run dev
```

打开 http://127.0.0.1:5173 。页面默认进入链上模式，不提供练习模式切换。未配置合约时标记“待部署”并禁用移动；配置后连接钱包即可开始。

```sh
npm run contracts:build  # Solidity 0.8.28 编译
npm test                 # 规则测试 + 本地 EVM 真正部署/交易验证
npm run build            # TypeScript 检查 + 静态站点构建
npm run preview          # 预览 dist/
```

## BOT Chain 配置

| 网络 | Chain ID | RPC | 浏览器 |
| --- | --- | --- | --- |
| 主网 | 677 | https://rpc.botchain.ai | https://scan.botchain.ai |
| 测试网 | 968 | https://rpc.bohr.life | https://scan.bohr.life |

来源：[BOT Chain 官方 Quick Guide](https://dev-docs.botchain.ai/docs/Developers/quick-guide/)。2026-09-24 实际请求两个 RPC 的 `eth_chainId`，分别返回 `0x2a5`、`0x3c8`。




## 部署合约

项目已于 2026-10-06 部署到 BOT Chain 主网（677），主网合约：`0x59A72E2AfeDbFD04ae2156d0a4F0Beb7779c0375`。前端默认使用主网。部署记录和链上核验结果分别见 `deployments/677.json` 与 `deployments/677-verification.json`。

测试网部署仍保留在 BOT Chain 测试网（968），合约地址：`0xF10B7e5cc6beFC2C6ddF23946bF34283bC4eA5f6`。部署记录位于 `deployments/968.json`。如需重新部署或部署主网，需要自己的部署账户及对应网络上的 BOT Gas。测试网代币入口：[BOT Faucet](https://faucet.botchain.ai)。

1. 在本机终端安全设置 `DEPLOYER_PRIVATE_KEY` 环境变量；不要将私钥写入 `VITE_` 变量，也不需要发送给任何人。
2. 先部署测试网：

```sh
BOT_NETWORK=testnet npm run deploy
```

3. 将输出的地址填入 `.env` 的 `VITE_BOT_TESTNET_CONTRACT`，重启前端，在测试网实测钱包签名和交易确认。
4. 准备好主网账户后：

```sh
BOT_NETWORK=mainnet npm run deploy
```

将主网地址填入 `VITE_BOT_MAINNET_CONTRACT`。该命令会实际广播并消耗 BOT Gas。脚本检查 RPC 链 ID，编译并部署 `Bot2048`，保存合约地址与交易哈希到 `deployments/<chainId>.json`。每局创建时固定收取 0.1 原生 BOT（另加网络 Gas），合约原子转入 `0xa577C97a16054379F10723fCCa4E612f937AE86e`。费用与收款地址为合约常量，没有修改入口。转账失败则整个开局回退；后续移动不收开局费。

只读核验主网部署：`BOT_NETWORK=mainnet node --import tsx scripts/verify-deployment.ts`。检查部署回执、运行代码、收费参数、付费开局模拟及未付款拒绝，不发送游戏交易。

构建前端：`npm run build`，发布 `dist/` 到支持 HTTPS 的静态托管。`VITE_` 配置在构建时注入，修改后需要重新构建。

## 游戏与交易流程

- 方块存储的是 `log2(value)`，16 个字节按高位到低位编码成 `uint128`。
- 方向：上 `0`，下 `1`，左 `2`，右 `3`。
- 游戏 ID 前 20 字节是玩家地址，后 12 字节使用安全随机数生成。
- 玩家点击“开一局”，立即请求钱包确认 `openGame(id, initialBoard, { value: 0.1 BOT })` 合约交易。合约验证起始盘并转出费用，确认后才允许第一步移动；页面不显示金额，钱包仍显示实际交易金额。
- 开局确认后，所有移动与计分在浏览器本地完成并保存，不再调用 `play`，也不再产生移动交易或 Gas。取消开局签名时保留原有游戏；待确认开局可刷新后检查交易恢复。
- 每次落子由 `keccak256(abi.encodePacked(gameId, uint256(moveNumber)))` 决定，与原合约一致。
- 保留上游 `% 100 > 90` 的概率阈值：实际生成 4 的概率是 9%，没有静默改写成 10%。
- 所有会话按模式、网络、合约、账户隔离保存在浏览器。发送后的交易哈希会保存；刷新后点击“检查交易”读取回执和合约状态。
- 同一局请在一个窗口中操作。清空浏览器数据会丢失本地会话；这版不提供跨设备历史索引，也不自动跟踪钱包中加速/替换后的新交易哈希。
- 界面分数由本地操作记录计算，当前前端仅用合约确认开局，后续棋盘、步数和分数均在本地计算；没有伪造的全球排行榜、奖励或链上分数。原版随机规则可以预先计算，不能直接用作有奖反作弊赛制。

## 目录

- `src/game.ts`：确定性棋盘逻辑及会话存储。
- `src/chain.ts`：官方网络配置、钱包连接、ABI 和校验。
- `src/App.tsx` / `src/styles.css`：游戏交互与响应式界面。
- `contracts/src/Bot2048.sol` / `LibBoard.sol`：迁移合约。
- `scripts/compile.mjs` / `deploy.mjs`：无需全局 Foundry 的编译、部署。
- `test/`：规则测试与本地合约交互测试。
- `contracts/test/`：保留的上游 Foundry 测试，已更新合约名称。运行前自行安装 Foundry 和 `forge-std` 到 `contracts/lib/forge-std`。

## 上游来源与变更

上游提交：`11f36807e2afb64b9dcc104645666faa113431f1`。Solidity 源文件保留原作者标记和 MIT SPDX 声明。

- `Monad2048` 改名 `Bot2048`，移除 Monad RPC 和历史部署记录。
- 移除生产库里未使用的测试导入，将库函数内联为 `internal`，部署只需一个合约，不需要另行部署、链接 Board 库。
- 保持原始棋盘规则；`startGame` 改为 payable 并固定收取开局费，增加转账失败原子回退和重入保护；使用 `paris` EVM 目标避免不必要的新操作码要求。
- 新增完整前端、BOT 主网/测试网配置、独立编译部署、测试和 CI。
