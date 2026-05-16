import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import { createUnlockState, decryptAppData, encryptAppData, parseEncryptedPackage, unlockPackageWithPassphrase } from "./encryption";

describe("encryption", () => {
  it("decrypts data encrypted with the same passphrase-derived key", async () => {
    const data = initialData();
    const unlock = await createUnlockState("coinly-passphrase");
    const encrypted = await encryptAppData(data, unlock);
    const decrypted = await decryptAppData(encrypted, unlock);

    expect(decrypted.localVersion).toBe(data.localVersion);
    expect(decrypted.accounts[0].name).toBe(data.accounts[0].name);
  });

  it("fails explicitly for wrong passphrases and corrupted ciphertext", async () => {
    const unlock = await createUnlockState("coinly-passphrase");
    const encrypted = await encryptAppData(initialData(), unlock);
    const wrongUnlock = await unlockPackageWithPassphrase(encrypted, "wrong-passphrase");
    const corrupted = encrypted.replace(/"ciphertext":"[^"]+"/, '"ciphertext":"AAAA"');

    await expect(decryptAppData(encrypted, wrongUnlock)).rejects.toThrow("解密失败");
    await expect(decryptAppData(corrupted, unlock)).rejects.toThrow("解密失败");
  });

  it("rejects unknown package formats", () => {
    expect(() => parseEncryptedPackage(JSON.stringify({ format: "coinly.plain.v1" })))
      .toThrow("不支持的加密包格式");
  });

  it("does not include account names, notes, or API keys as plaintext", async () => {
    const data = {
      ...initialData(),
      accounts: [{ ...initialData().accounts[0], name: "Secret Account" }],
      transactions: [{ ...sampleTransaction(), note: "sensitive memo" }],
      aiSettings: { provider: "openai-compatible" as const, endpoint: "https://api.example/v1", model: "x", apiKey: "secret-api-key" },
    };
    const unlock = await createUnlockState("coinly-passphrase");
    const encrypted = await encryptAppData(data, unlock);

    expect(encrypted).not.toContain("Secret Account");
    expect(encrypted).not.toContain("sensitive memo");
    expect(encrypted).not.toContain("secret-api-key");
  });
});

function sampleTransaction() {
  const base = initialData();
  return {
    id: "tx",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    kind: "expense" as const,
    accountId: base.accounts[0].id,
    amount: 10,
    currency: "CNY",
    occurredAt: "2026-01-01T00:00:00.000Z",
    categoryId: base.categories[0].id,
    tagIds: [],
    note: "",
  };
}
