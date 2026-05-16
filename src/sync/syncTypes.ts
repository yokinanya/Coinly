export type RemotePayload = string | undefined;

export interface RemoteSnapshot {
  readonly payload: string;
  readonly version?: string;
}

export interface RemoteStoreAdapter<TConfig> {
  readonly read: (config: TConfig) => Promise<RemoteSnapshot | undefined>;
  readonly write: (config: TConfig, payload: string, version?: string) => Promise<void>;
  readonly test: (config: TConfig) => Promise<"found" | "missing">;
}
