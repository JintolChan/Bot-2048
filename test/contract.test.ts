import test from "node:test";
import assert from "node:assert/strict";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import {
  BrowserProvider,
  ContractFactory,
  solidityPackedKeccak256,
} from "ethers";
import solc from "solc";
import { readFileSync } from "node:fs";
import {
  appendMove,
  createId,
  move,
  newSession,
  pack,
  slide,
  startBoard,
  unpack,
} from "../src/game.ts";
import type { Direction } from "../src/game.ts";
const sources = Object.fromEntries(
  ["Bot2048.sol", "LibBoard.sol"].map((name) => [
    `src/${name}`,
    {
      content: readFileSync(
        new URL(`../contracts/src/${name}`, import.meta.url),
        "utf8",
      ),
    },
  ]),
) as Record<string, { content: string }>;
sources["src/BoardHarness.sol"] = {
  content:
    'pragma solidity ^0.8.28; import {Board} from "src/LibBoard.sol"; contract BoardHarness { function process(uint128 b,uint8 d,uint256 s) external pure returns(uint128){ return Board.processMove(b,d,s); } }',
};
sources["src/FeeReceiver.sol"] = {
  content: `pragma solidity ^0.8.28;
contract FeeReceiver {
  receive() external payable {
    (bool ok, bytes memory reason) = msg.sender.call(abi.encodeWithSignature("play(bytes32,uint8,uint128)",bytes32(0),uint8(0),uint128(0)));
    require(!ok && reason.length == 4 && bytes4(reason) == bytes4(keccak256("ReentrantCall()")), "Reentry was not blocked");
  }
}`,
};
const output = JSON.parse(
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
            "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
          },
        },
      },
    }),
  ),
);
assert.equal(
  output.errors?.filter((e: { severity: string }) => e.severity === "error")
    .length ?? 0,
  0,
);
test(
  "BOT Chain contract integration: frontend moves, rejection paths, owner isolation",
  { timeout: 120000 },
  async (t) => {
    const hre = await createHardhatRuntimeEnvironment({
      networks: { bot: { type: "edr-simulated", chainId: 677 } },
    });
    const connection = await hre.network.create("bot");
    const provider = new BrowserProvider(connection.provider);
    provider.pollingInterval = 10;
    try {
      const signer = await provider.getSigner(0),
        other = await provider.getSigner(1);
      const compiled = output.contracts["src/Bot2048.sol"].Bot2048;
      const game: any = await new ContractFactory(
        compiled.abi,
        compiled.evm.bytecode.object,
        signer,
      ).deploy();
      await game.waitForDeployment();
      const boardArtifact =
        output.contracts["src/BoardHarness.sol"].BoardHarness;
      const harness: any = await new ContractFactory(
        boardArtifact.abi,
        boardArtifact.evm.bytecode.object,
        signer,
      ).deploy();
      await harness.waitForDeployment();
      let session = {
        ...newSession(await signer.getAddress()),
        id: (await signer.getAddress()).toLowerCase() + "12".repeat(12),
        boards: [pack(startBoard("0x" + "34".repeat(32))).toString()],
      };
      for (let i = 0; i < 3; i++) {
        const board = unpack(BigInt(session.boards.at(-1)!));
        const direction = ([0, 1, 2, 3] as Direction[]).find(
          (d) => slide(board, d).changed,
        )!;
        session = appendMove(session, direction)!;
      }
      const fee = 100000000000000000n;
      const recipient = "0xa577C97a16054379F10723fCCa4E612f937AE86e";
      const recipientBalance = async () =>
        BigInt(await provider.send("eth_getBalance", [recipient, "latest"]));
      await t.test(
        "fixed native fee and recipient, underpayment and overpayment rejected",
        async () => {
          assert.equal(await game.GAME_FEE(), fee);
          assert.equal(await game.FEE_RECIPIENT(), recipient);
          for (const value of [0n, fee - 1n, fee + 1n]) {
            await assert.rejects(
              game.startGame.staticCall(
                session.id,
                session.boards.map(BigInt),
                session.moves,
                { value },
              ),
              /IncorrectGameFee/,
            );
          }
          assert.equal(await game.latestBoard(session.id), 0n);
        },
      );
      await t.test(
        "failed recipient transfer rolls back payment and game state",
        async () => {
          // Install a rejecting receiver only on the disposable local EVM.
          await provider.send("hardhat_setCode", [recipient, "0x60006000fd"]);
          const before = await recipientBalance();
          const hash = solidityPackedKeccak256(
            ["uint128[4]"],
            [session.boards.map(BigInt)],
          );
          await assert.rejects(async () => {
            const tx = await game.startGame(
              session.id,
              session.boards.map(BigInt),
              session.moves,
              { value: fee, gasLimit: 1500000 },
            );
            await tx.wait();
          });
          assert.equal(await game.latestBoard(session.id), 0n);
          assert.equal(await game.gameHashOf(hash), "0x" + "00".repeat(32));
          assert.equal(await recipientBalance(), before);
          assert.equal(
            BigInt(
              await provider.send("eth_getBalance", [
                await game.getAddress(),
                "latest",
              ]),
            ),
            0n,
          );
          await provider.send("hardhat_setCode", [recipient, "0x"]);
        },
      );
      await t.test(
        "openGame charges before any moves; rejects unpaid, duplicate and invalid starts",
        async () => {
          const fresh = newSession(await signer.getAddress());
          const board = BigInt(fresh.boards[0]);
          for (const value of [0n, fee - 1n, fee + 1n])
            await assert.rejects(
              game.openGame.staticCall(fresh.id, board, { value }),
              /IncorrectGameFee/,
            );
          await assert.rejects(
            game.openGame.staticCall(fresh.id, 0, { value: fee }),
            /GameBoardInvalid/,
          );
          await assert.rejects(
            game
              .connect(other)
              .openGame.staticCall(fresh.id, board, { value: fee }),
            /GamePlayerInvalid/,
          );
          await assert.rejects(
            game.play.staticCall(fresh.id, 0, board),
            /GameBoardInvalid/,
          );
          await provider.send("hardhat_setCode", [recipient, "0x60006000fd"]);
          await assert.rejects(
            game.openGame.staticCall(fresh.id, board, { value: fee }),
            /FeeTransferFailed/,
          );
          assert.equal(await game.nextMove(fresh.id), 0n);
          await provider.send("hardhat_setCode", [recipient, "0x"]);
          const before = await recipientBalance();
          await (await game.openGame(fresh.id, board, { value: fee })).wait();
          assert.equal(await game.nextMove(fresh.id), 1n);
          assert.equal(await game.latestBoard(fresh.id), board);
          assert.equal((await recipientBalance()) - before, fee);
          await assert.rejects(
            game.openGame.staticCall(fresh.id, board, { value: fee }),
            /GameIdUsed/,
          );
          const direction = ([0, 1, 2, 3] as Direction[]).find(
            (d) => slide(unpack(board), d).changed,
          )!;
          const moved = appendMove(fresh, direction)!;
          await (
            await game.play(fresh.id, direction, BigInt(moved.boards[1]))
          ).wait();
          assert.equal(await game.nextMove(fresh.id), 2n);
          assert.equal(
            await game.latestBoard(fresh.id),
            BigInt(moved.boards[1]),
          );
          assert.equal((await recipientBalance()) - before, fee);
        },
      );
      const beforePayment = await recipientBalance();
      await t.test(
        "startGame pays exactly once and blocks receiver reentry",
        async () => {
          await provider.send("hardhat_setCode", [
            recipient,
            "0x" +
              output.contracts["src/FeeReceiver.sol"].FeeReceiver.evm
                .deployedBytecode.object,
          ]);
          await (
            await game.startGame(
              session.id,
              session.boards.map(BigInt),
              session.moves,
              { value: 100000000000000000n },
            )
          ).wait();
          assert.equal(
            await game.latestBoard(session.id),
            BigInt(session.boards.at(-1)!),
          );
          assert.equal(await game.nextMove(session.id), 4n);
          assert.equal((await recipientBalance()) - beforePayment, fee);
          await provider.send("hardhat_setCode", [recipient, "0x"]);
          assert.equal(
            BigInt(
              await provider.send("eth_getBalance", [
                await game.getAddress(),
                "latest",
              ]),
            ),
            0n,
          );
        },
      );
      await t.test("used game IDs and wrong owners are rejected", async () => {
        await assert.rejects(
          game.startGame.staticCall(
            session.id,
            session.boards.map(BigInt),
            session.moves,
            { value: 100000000000000000n },
          ),
        );
        await assert.rejects(
          game.connect(other).play.staticCall(session.id, 0, 0),
        );
        const otherId = createId(await other.getAddress());
        await assert.rejects(
          game.startGame.staticCall(
            otherId,
            session.boards.map(BigInt),
            session.moves,
            { value: 100000000000000000n },
          ),
        );
      });
      await t.test(
        "invalid boards and invalid directions are rejected",
        async () => {
          await assert.rejects(game.play.staticCall(session.id, 4, 0));
          await assert.rejects(game.play.staticCall(session.id, 0, 0));
          await assert.rejects(
            game.startGame.staticCall(
              createId(await signer.getAddress()),
              [0, 0, 0, 0],
              [0, 0, 0],
              { value: 100000000000000000n },
            ),
          );
        },
      );
      await t.test(
        "subsequent moves match Solidity and never charge another entry fee",
        async () => {
          let board = unpack(BigInt(session.boards.at(-1)!));
          let checked = 0;
          for (let step = 4; step < 54; step++) {
            const possible = ([0, 1, 2, 3] as Direction[]).filter(
              (d) => slide(board, d).changed,
            );
            if (!possible.length) break;
            for (const direction of possible) {
              const expected = move(board, direction, session.id, step);
              const seed = BigInt(
                solidityPackedKeccak256(
                  ["bytes32", "uint256"],
                  [session.id, step],
                ),
              );
              assert.equal(
                await harness.process(pack(board), direction, seed),
                pack(expected.board),
              );
              checked++;
            }
            const direction = possible[step % possible.length];
            board = move(board, direction, session.id, step).board;
            await (await game.play(session.id, direction, pack(board))).wait();
            assert.equal(await game.latestBoard(session.id), pack(board));
            assert.equal(await game.nextMove(session.id), BigInt(step + 1));
          }
          assert.ok(checked >= 100, `Only checked ${checked} transformations`);
          assert.equal((await recipientBalance()) - beforePayment, fee);
          await assert.rejects(
            game.play.staticCall(session.id, 0, 0, { value: fee }),
          );
        },
      );
    } finally {
      await provider.destroy();
      await connection.close();
    }
  },
);
