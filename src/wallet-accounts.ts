import type { Eip1193Provider } from "ethers";

export async function requestWalletAccounts(
  wallet: Eip1193Provider,
  chooseAgain: boolean,
): Promise<string[]> {
  if (chooseAgain) {
    try {
      await wallet.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (error) {
      const code = Number((error as { code?: number }).code);
      if (code === -32601 || code === 4200)
        throw new Error(
          "当前钱包不支持重新选择账户。请在钱包的已连接网站中断开本站授权，再重新连接。",
        );
      // A cancelled account picker must never silently reuse the previous account.
      throw error;
    }
  }
  return (await wallet.request({ method: "eth_requestAccounts" })) as string[];
}
