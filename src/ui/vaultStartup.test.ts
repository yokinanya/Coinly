import { describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import { migrateData } from "../storage/indexedDb";
import { submitVault } from "./vaultStartup";

const mocks = vi.hoisted(() => ({
  currentUnlockState: vi.fn(),
  initializeVault: vi.fn(async () => undefined),
  saveData: vi.fn(async () => ({ version: 1 })),
  tryUnlockRememberedDevice: vi.fn(async () => false),
  unlockVaultWithPassphrase: vi.fn(async () => undefined),
}));

vi.mock("../storage/indexedDb", async () => {
  const actual = await vi.importActual<typeof import("../storage/indexedDb")>("../storage/indexedDb");
  return {
    ...actual,
    saveData: mocks.saveData,
  };
});

vi.mock("../storage/vaultSession", () => {
  return {
    currentUnlockState: mocks.currentUnlockState,
    initializeVault: mocks.initializeVault,
    tryUnlockRememberedDevice: mocks.tryUnlockRememberedDevice,
    unlockVaultWithPassphrase: mocks.unlockVaultWithPassphrase,
  };
});

describe("vault startup", () => {
  it("creates a vault from a full data file", async () => {
    const data = initialData();
    const migrated = migrateData(data);
    const setData = vi.fn();
    const setSaveToken = vi.fn();
    const setStatus = vi.fn();

    await submitVault({
      state: { kind: "empty" },
      passphrase: "coinly-passphrase",
      rememberDevice: true,
      fullDataPackage: JSON.stringify(data),
      setData,
      setSaveToken,
      setStatus,
    });

    expect(mocks.initializeVault).toHaveBeenCalledWith("coinly-passphrase", true);
    expect(setData).toHaveBeenCalledWith(migrated);
    expect(mocks.saveData).toHaveBeenCalledWith(migrated, { version: 0 });
    expect(setSaveToken).toHaveBeenCalledWith({ version: 0 });
    expect(setStatus).toHaveBeenCalledWith({ tone: "success", text: "" });
  });
});
