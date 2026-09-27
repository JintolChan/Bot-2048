import { readFileSync, writeFileSync } from "node:fs";
import { Contract, JsonRpcProvider, VoidSigner, keccak256 } from "ethers";
import { newSession } from "../src/game.ts";
const deployment = JSON.parse(readFileSync("deployments/968.json", "utf8"));
const artifact = JSON.parse(readFileSync("artifacts/Bot2048.json", "utf8"));
const provider = new JsonRpcProvider("https://rpc.bohr.life", undefined, {
  batchMaxCount: 1,
});
try {
  if ((await provider.getNetwork()).chainId !== 968n)
    throw new Error("Unexpected chain ID");
  const receipt = await provider.getTransactionReceipt(
    deployment.transactionHash,
  );
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.contractAddress?.toLowerCase() !== deployment.address.toLowerCase()
  )
    throw new Error("Deployment receipt not confirmed");
  const code = await provider.getCode(deployment.address);
  if (code !== artifact.deployedBytecode)
    throw new Error("Deployed bytecode does not match the local build");
  const contract = new Contract(
    deployment.address,
    artifact.abi,
    new VoidSigner(receipt.from, provider),
  );
  let session = newSession(receipt.from);
  await contract.openGame.staticCall(session.id, BigInt(session.boards[0]), {
    value: await contract.GAME_FEE(),
  });
  let unpaidStartRejected = false;
  try {
    await contract.openGame.staticCall(session.id, BigInt(session.boards[0]));
  } catch (error) {
    unpaidStartRejected =
      (error as { revert?: { name?: string } }).revert?.name ===
      "IncorrectGameFee";
  }
  if (!unpaidStartRejected)
    throw new Error("Unpaid start did not reject with IncorrectGameFee");
  const gameFee = await contract.GAME_FEE();
  const feeRecipient = await contract.FEE_RECIPIENT();
  if (
    gameFee !== 100000000000000000n ||
    feeRecipient.toLowerCase() !== "0xa577c97a16054379f10723fcca4e612f937ae86e"
  )
    throw new Error("Unexpected fee settings");
  const result = {
    unpaidStartRejected,
    gameFeeWei: gameFee.toString(),
    feeRecipient,
    chainId: 968,
    address: deployment.address,
    transactionHash: deployment.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    feeWei: receipt.fee.toString(),
    runtimeCodeHash: keccak256(code),
    openGameSimulation: "passed",
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(
    "deployments/968-verification.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  provider.destroy();
}
