import test from "node:test";
import assert from "node:assert/strict";
import { requestWalletAccounts } from "../src/wallet-accounts.ts";

test("reconnecting opens permission selection before reading the selected account", async () => {
  const calls: string[] = [];
  const selected = ["0x" + "ab".repeat(20)];
  const accounts = await requestWalletAccounts(
    {
      request: async ({ method, params }) => {
        calls.push(method);
        if (method === "wallet_requestPermissions") {
          assert.deepEqual(params, [{ eth_accounts: {} }]);
          return [];
        }
        return selected;
      },
    },
    true,
  );
  assert.deepEqual(calls, ["wallet_requestPermissions", "eth_requestAccounts"]);
  assert.deepEqual(accounts, selected);
});

test("cancelled or unsupported account selection never silently logs in", async () => {
  for (const code of [4001, -32601, 4200]) {
    const calls: string[] = [];
    await assert.rejects(
      requestWalletAccounts(
        {
          request: async ({ method }) => {
            calls.push(method);
            throw Object.assign(new Error("wallet error"), { code });
          },
        },
        true,
      ),
    );
    assert.deepEqual(calls, ["wallet_requestPermissions"]);
  }
});

test("initial connection uses the normal wallet connection request", async () => {
  const calls: string[] = [];
  await requestWalletAccounts(
    {
      request: async ({ method }) => {
        calls.push(method);
        return [];
      },
    },
    false,
  );
  assert.deepEqual(calls, ["eth_requestAccounts"]);
});
