import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
export function compile() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sources = Object.fromEntries(
    ["Bot2048.sol", "LibBoard.sol"].map((name) => [
      `src/${name}`,
      { content: readFileSync(path.join(root, "contracts/src", name), "utf8") },
    ]),
  );
  const result = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
              ],
            },
          },
        },
      }),
    ),
  );
  for (const error of result.errors ?? []) {
    if (error.severity === "error") throw new Error(error.formattedMessage);
  }
  const compiled = result.contracts["src/Bot2048.sol"].Bot2048;
  const artifact = {
    contractName: "Bot2048",
    compiler: solc.version(),
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
  };
  mkdirSync(path.join(root, "artifacts"), { recursive: true });
  writeFileSync(
    path.join(root, "artifacts/Bot2048.json"),
    JSON.stringify(artifact, null, 2),
  );
  return artifact;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifact = compile();
  console.log(
    `Bot2048 compiled: ${(artifact.bytecode.length - 2) / 2} bytes, Solidity ${artifact.compiler}`,
  );
}
