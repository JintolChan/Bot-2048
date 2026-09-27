import { ContractFactory, Wallet, getCreateAddress, keccak256 } from "ethers";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { compile } from "./compile.mjs";
const name = process.env.BOT_NETWORK ?? "testnet";
const networks = {
  mainnet: {
    id: 677,
    rpc: "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
  },
  testnet: {
    id: 968,
    rpc: "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
  },
};
const network = networks[name];
if (!network) throw new Error("BOT_NETWORK must be mainnet or testnet");
if (!process.env.DEPLOYER_PRIVATE_KEY)
  throw new Error(
    "Export DEPLOYER_PRIVATE_KEY locally before deploying. Do not put it in VITE_ variables.",
  );
// Single, bounded RPC requests avoid unsupported batch and optional fee methods.
async function rpc(method, params) {
  const response = await fetch(network.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error(JSON.stringify(body.error ?? response.status));
  return body.result;
}
if (Number(BigInt(await rpc("eth_chainId", []))) !== network.id)
  throw new Error("RPC chain ID mismatch");
const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY);
const artifact = compile();
const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const request = await factory.getDeployTransaction();
mkdirSync("deployments", { recursive: true });
const pendingPath = `deployments/${network.id}-pending.json`;
let pending;
if (existsSync(pendingPath)) {
  pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  console.log(`Recovering deployment: ${pending.transactionHash}`);
} else {
  console.log("Estimating deployment gas…");
  const gas = BigInt(
    await rpc("eth_estimateGas", [{ ...request, from: wallet.address }]),
  );
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  const gasLimit = (gas * 120n) / 100n;
  const balance = BigInt(
    await rpc("eth_getBalance", [wallet.address, "latest"]),
  );
  if (balance < gasLimit * gasPrice)
    throw new Error("Insufficient BOT for deployment gas");
  const nonce = Number(
    BigInt(await rpc("eth_getTransactionCount", [wallet.address, "pending"])),
  );
  const signed = await wallet.signTransaction({
    ...request,
    nonce,
    chainId: network.id,
    type: 0,
    gasPrice,
    gasLimit,
  });
  pending = {
    chainId: network.id,
    address: getCreateAddress({ from: wallet.address, nonce }),
    transactionHash: keccak256(signed),
    compiler: artifact.compiler,
  };
  // Record the public transaction identity before broadcasting, so an uncertain
  // RPC response can be recovered without silently sending a second deployment.
  writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + "\n");
  console.log(`Deployment transaction: ${pending.transactionHash}`);
  const returnedHash = await rpc("eth_sendRawTransaction", [signed]);
  if (returnedHash !== pending.transactionHash)
    throw new Error("Transaction hash mismatch");
}
let receipt = null;
for (let attempt = 0; attempt < 30 && !receipt; attempt++) {
  receipt = await rpc("eth_getTransactionReceipt", [pending.transactionHash]);
  if (!receipt) await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!receipt)
  throw new Error(
    `Awaiting confirmation for ${pending.transactionHash}; rerun to recover this transaction.`,
  );
if (
  receipt.status !== "0x1" ||
  receipt.contractAddress?.toLowerCase() !== pending.address.toLowerCase()
)
  throw new Error(
    "Deployment transaction failed or contract address mismatched",
  );
const address = pending.address;
const code = await rpc("eth_getCode", [address, "latest"]);
if (code !== artifact.deployedBytecode)
  throw new Error(
    "Deployed bytecode differs from the current build; inspect the pending deployment before continuing.",
  );
writeFileSync(
  `deployments/${network.id}.json`,
  JSON.stringify(
    {
      chainId: network.id,
      address,
      transactionHash: pending.transactionHash,
      compiler: artifact.compiler,
    },
    null,
    2,
  ),
);
unlinkSync(pendingPath);
console.log(
  `Deployed: ${network.explorer}/address/${address}\nSet VITE_BOT_${name.toUpperCase()}_CONTRACT=${address} and restart the frontend.`,
);
