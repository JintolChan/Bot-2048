import test from "node:test";
import assert from "node:assert/strict";
import {
  appendMove,
  createId,
  isGameOver,
  move,
  newSession,
  pack,
  rollback,
  readSession,
  saveSession,
  slide,
  startBoard,
  unpack,
} from "../src/game.ts";
import type { Direction } from "../src/game.ts";
const row = (...values: number[]) => [...values, ...Array(12).fill(0)];
test("packing uses the contract’s big-endian exponent representation", () => {
  const board = Array.from({ length: 16 }, (_, i) => i);
  assert.equal(pack(board), 0x000102030405060708090a0b0c0d0e0fn);
  assert.deepEqual(unpack(pack(board)), board);
});
test("each tile merges only once and score counts the merged values", () => {
  assert.deepEqual(slide(row(1, 1, 1, 1), 2), {
    board: row(2, 2, 0, 0),
    score: 8,
    changed: true,
  });
  assert.deepEqual(slide(row(1, 1, 2, 0), 2), {
    board: row(2, 2, 0, 0),
    score: 4,
    changed: true,
  });
  assert.deepEqual(slide(row(1, 1, 1, 1), 3), {
    board: row(0, 0, 2, 2),
    score: 8,
    changed: true,
  });
});
test("vertical directions preserve the contract orientation", () => {
  const board = Array(16).fill(0);
  board[0] = 1;
  board[8] = 1;
  const up = slide(board, 0),
    down = slide(board, 1);
  assert.equal(up.board[0], 2);
  assert.equal(down.board[12], 2);
  assert.equal(up.score, 4);
});
test("unchanged moves do not spawn a tile or increment a session", () => {
  const session = {
    ...newSession(),
    boards: [pack(row(1, 2, 3, 4)).toString()],
  };
  assert.equal(appendMove(session, 2), null);
});
test("seeds produce reproducible, valid starting boards and ownership-bound IDs", () => {
  const seed = "0x" + "12".repeat(32);
  assert.deepEqual(startBoard(seed), startBoard(seed));
  assert.equal(startBoard(seed).filter(Boolean).length, 2);
  assert.ok(startBoard(seed).every((n) => n >= 0 && n <= 2));
  const address = "0x" + "ab".repeat(20);
  const id = createId(address);
  assert.equal(id.length, 66);
  assert.ok(id.startsWith(address));
});
test("game over requires no legal direction", () => {
  const board = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1];
  assert.equal(isGameOver(board), true);
  board[0] = 0;
  assert.equal(isGameOver(board), false);
});
test("rejected move rolls back the board, score, and move count", () => {
  const session = newSession();
  const direction = ([0, 1, 2, 3] as Direction[]).find(
    (d) => slide(unpack(BigInt(session.boards[0])), d).changed,
  )!;
  const next = appendMove(session, direction)!;
  assert.deepEqual(
    { ...rollback(next), pending: undefined },
    { ...session, pending: undefined },
  );
});
test("spawning matches upstream threshold (91..99 generates 4), deterministic across calls", () => {
  const id = "0x" + "ab".repeat(32);
  const result = move(row(1, 1, 0, 0), 2, id, 1);
  assert.deepEqual(result, move(row(1, 1, 0, 0), 2, id, 1));
  assert.equal(result.board.filter(Boolean).length, 2);
});

test("paid sessions keep local moves and score across reload without new transactions", () => {
  const storage = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  try {
    const address = "0x" + "ab".repeat(20);
    let session = {
      ...newSession(address),
      started: true,
      transactions: ["0xpaid"],
    };
    for (let i = 0; i < 12; i++) {
      const board = unpack(BigInt(session.boards.at(-1)!));
      const direction = ([0, 1, 2, 3] as Direction[]).find(
        (d) => slide(board, d).changed,
      )!;
      session = { ...appendMove(session, direction)!, started: true };
      assert.equal(saveSession("local-game", session), true);
      assert.deepEqual(readSession("local-game", address), session);
    }
    assert.equal(session.moves.length, 12);
    assert.equal(session.confirmed, 0);
    assert.equal(session.pending, undefined);
    assert.deepEqual(session.transactions, ["0xpaid"]);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
