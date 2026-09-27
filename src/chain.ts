import { BrowserProvider, Contract, getAddress, isAddress } from "ethers";
import type { Eip1193Provider } from "ethers";
import { requestWalletAccounts } from "./wallet-accounts";
export type NetworkName = "mainnet" | "testnet";
export const networks = {
  mainnet: {
    id: 677,
    label: "BOT Mainnet",
    rpc: "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
    address: import.meta.env.VITE_BOT_MAINNET_CONTRACT ?? "",
  },
  testnet: {
    id: 968,
    label: "BOT Testnet",
    rpc: "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
    address: import.meta.env.VITE_BOT_TESTNET_CONTRACT ?? "",
  },
} as const;
export const GAME_FEE = 100_000_000_000_000_000n;
export const FEE_RECIPIENT = "0xa577C97a16054379F10723fCCa4E612f937AE86e";
export const abi = [
  "function GAME_FEE() view returns (uint256)",
  "function FEE_RECIPIENT() view returns (address)",
  "error IncorrectGameFee()",
  "error FeeTransferFailed()",
  "error ReentrantCall()",
  "function openGame(bytes32 gameId, uint128 board) payable",
  "function startGame(bytes32 gameId, uint128[4] boards, uint8[3] moves) payable",
  "function play(bytes32 gameId, uint8 move, uint128 resultBoard)",
  "function getBoard(bytes32 gameId) view returns (uint8[16] boardArr, uint256 nextMoveNumber)",
  "function state(bytes32 gameId) view returns (uint8 move, uint120 nextMove, uint128 board)",
  "error GameIdUsed()",
  "error GamePlayed()",
  "error GameBoardInvalid()",
  "error GamePlayerInvalid()",
  "error MoveInvalid()",
];
export interface InjectedProvider extends Eip1193Provider {
  on?: (event: string, listener: (value: unknown) => void) => void;
  removeListener?: (event: string, listener: (value: unknown) => void) => void;
}
declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}
export function configured(name: NetworkName) {
  const address = networks[name].address;
  return isAddress(address) && BigInt(address) !== 0n;
}
export async function connectWallet(name: NetworkName, chooseAgain = false) {
  if (!window.ethereum)
    throw new Error(
      "未检测到钱包。请在安装了 MetaMask 或 BO Wallet 的浏览器中打开。",
    );
  const accounts = await requestWalletAccounts(window.ethereum, chooseAgain);
  if (!accounts[0]) throw new Error("钱包未提供账户。");
  await switchNetwork(name);
  return getAddress(accounts[0]);
}
export async function switchNetwork(name: NetworkName) {
  if (!window.ethereum) throw new Error("请先安装兼容 EVM 的钱包。");
  const net = networks[name];
  const chainId = `0x${net.id.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      data?: { originalError?: { code?: number } };
    };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: `BOT Chain ${name === "mainnet" ? "Mainnet" : "Testnet"}`,
          rpcUrls: [net.rpc],
          nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
          blockExplorerUrls: [net.explorer],
        },
      ],
    });
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}
export async function getGameContract(name: NetworkName, address: string) {
  if (!configured(name))
    throw new Error("此网络的游戏合约尚未配置，请在部署完成后重试。");
  if (!window.ethereum) throw new Error("钱包已断开，请重新连接。");
  const provider = new BrowserProvider(window.ethereum, "any");
  if (Number((await provider.getNetwork()).chainId) !== networks[name].id)
    throw new Error("钱包网络不匹配，请切换到所选 BOT Chain 网络。");
  const signer = await provider.getSigner();
  if ((await signer.getAddress()).toLowerCase() !== address.toLowerCase())
    throw new Error("钱包账户已变更，请重新连接。");
  const contractAddress = networks[name].address;
  if ((await provider.getCode(contractAddress)) === "0x")
    throw new Error("配置的地址没有合约，请检查部署结果。");
  const contract = new Contract(contractAddress, abi, signer);
  if (
    (await contract.GAME_FEE()) !== GAME_FEE ||
    (await contract.FEE_RECIPIENT()).toLowerCase() !==
      FEE_RECIPIENT.toLowerCase()
  )
    throw new Error("合约开局费用或收款地址与页面不一致，请检查配置。");
  return { contract, provider };
}
export function errorMessage(error: unknown): string {
  const e = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
    reason?: string;
  };
  if (e.code === 4001 || e.code === "ACTION_REJECTED")
    return "已取消钱包请求。游戏进度已保留，可以重试。";
  if (e.code === "INSUFFICIENT_FUNDS")
    return "BOT 余额不足，请补充余额并预留网络 Gas。";
  return e.reason ?? e.shortMessage ?? e.message ?? "操作失败，请重试。";
}
