import {
  hexlify,
  keccak256,
  randomBytes,
  solidityPackedKeccak256,
} from "ethers";
export type Direction = 0 | 1 | 2 | 3;
export const directions = ["上", "下", "左", "右"] as const;
export type Board = number[];
export function pack(board: Board): bigint {
  return board.reduce((value, tile) => (value << 8n) | BigInt(tile), 0n);
}
export function unpack(board: bigint): Board {
  return Array.from({ length: 16 }, (_, i) =>
    Number((board >> BigInt((15 - i) * 8)) & 255n),
  );
}
export function createId(
  address = "0x0000000000000000000000000000000000000000",
): string {
  return address.toLowerCase() + hexlify(randomBytes(12)).slice(2);
}
export function startBoard(seed = hexlify(randomBytes(32))): Board {
  let value = BigInt(keccak256(seed));
  const first = Number(value % 16n);
  value >>= 16n;
  let second = Number(value % 15n);
  if (second >= first) second++;
  const board = Array<number>(16).fill(0);
  board[first] = board[second] = value % 100n > 90n ? 2 : 1;
  return board;
}
export function slide(
  board: Board,
  direction: Direction,
): { board: Board; score: number; changed: boolean } {
  const result = Array<number>(16).fill(0);
  let score = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, i) =>
      direction === 0
        ? i * 4 + line
        : direction === 1
          ? (3 - i) * 4 + line
          : direction === 2
            ? line * 4 + i
            : line * 4 + 3 - i,
    );
    const values = indices.map((i) => board[i]).filter(Boolean);
    const merged: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) {
        merged.push(values[i] + 1);
        score += 2 ** (values[i] + 1);
        i++;
      } else merged.push(values[i]);
    }
    indices.forEach((index, i) => {
      result[index] = merged[i] ?? 0;
    });
  }
  return {
    board: result,
    score,
    changed: result.some((tile, i) => tile !== board[i]),
  };
}
export function move(
  board: Board,
  direction: Direction,
  gameId: string,
  moveNumber: number,
) {
  const result = slide(board, direction);
  if (!result.changed) return result;
  const seed = BigInt(
    solidityPackedKeccak256(["bytes32", "uint256"], [gameId, moveNumber]),
  );
  const empty = result.board.flatMap((tile, i) => (tile === 0 ? [i] : []));
  if (empty.length)
    result.board[empty[Number(seed % BigInt(empty.length))]] =
      seed % 100n > 90n ? 2 : 1;
  return result;
}
export function isGameOver(board: Board) {
  return ([0, 1, 2, 3] as Direction[]).every(
    (direction) => !slide(board, direction).changed,
  );
}
export interface Session {
  version: 1;
  id: string;
  boards: string[];
  moves: Direction[];
  scores: number[];
  confirmed: number;
  started?: boolean;
  pending?: { hash: string; count: number };
  transactions: string[];
}
export function newSession(address?: string): Session {
  return {
    version: 1,
    id: createId(address),
    boards: [pack(startBoard()).toString()],
    moves: [],
    scores: [0],
    confirmed: 0,
    transactions: [],
  };
}
export function appendMove(
  session: Session,
  direction: Direction,
): Session | null {
  const result = move(
    unpack(BigInt(session.boards.at(-1)!)),
    direction,
    session.id,
    session.moves.length + 1,
  );
  if (!result.changed) return null;
  return {
    ...session,
    boards: [...session.boards, pack(result.board).toString()],
    moves: [...session.moves, direction],
    scores: [...session.scores, session.scores.at(-1)! + result.score],
  };
}
export function rollback(session: Session): Session {
  return {
    ...session,
    boards: session.boards.slice(0, -1),
    moves: session.moves.slice(0, -1),
    scores: session.scores.slice(0, -1),
    pending: undefined,
  };
}
export function readSession(key: string, address?: string): Session {
  try {
    const session = JSON.parse(
      localStorage.getItem(key) ?? "null",
    ) as Session | null;
    if (
      session?.version === 1 &&
      /^0x[0-9a-f]{64}$/i.test(session.id) &&
      (!address ||
        session.id.slice(0, 42).toLowerCase() === address.toLowerCase()) &&
      Array.isArray(session.boards) &&
      session.boards.length === session.moves.length + 1 &&
      session.scores.length === session.boards.length &&
      session.boards.every((b) => /^\d+$/.test(b) && BigInt(b) < 2n ** 128n) &&
      session.moves.every((m) => [0, 1, 2, 3].includes(m)) &&
      session.confirmed >= 0 &&
      session.confirmed <= session.moves.length
    )
      return session;
  } catch {
    /* A malformed or inaccessible save must not prevent playing. */
  }
  return newSession(address);
}
export function saveSession(key: string, session: Session) {
  try {
    localStorage.setItem(key, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
