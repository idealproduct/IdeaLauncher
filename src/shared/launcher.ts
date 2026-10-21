export const settingKeys = [
  "memory",
  "jvmArgs",
  "javaPathOverride",
  "gpuAdapter",
] as const;
export type SettingKey = (typeof settingKeys)[number];

export interface LaunchSettings {
  minMemory: number;
  maxMemory: number;
  jvmArgs: string[];
  javaPathOverride?: string;
  gpuAdapter?: string;
}

export interface GlobalSettings extends LaunchSettings {
  forcedSettings: SettingKey[];
}

export const defaultGlobalSettings: GlobalSettings = {
  minMemory: 1024,
  maxMemory: 4096,
  jvmArgs: [],
  forcedSettings: [],
};

export interface InstanceSummary extends LaunchSettings {
  id: string;
  name: string;
  minecraftVersion: string;
  loader: "vanilla" | "forge" | "fabric" | "neoforge";
  javaMajorVersion: number;
  offlineMode: boolean;
  offlineUsername?: string;
  inheritedSettings: SettingKey[];
}

export type UpdateInstancePayload = Omit<
  InstanceSummary,
  "minecraftVersion" | "loader" | "javaMajorVersion"
>;

export interface GpuAdapterSummary {
  id: string;
  name: string;
  vendorId: string;
  deviceId: string;
  subsysId: string;
}

export interface InstanceProcessState {
  instanceId: string;
  status: "starting" | "running" | "stopping" | "exited" | "failed";
  pid?: number;
  startedAt: string;
  exitCode?: number | null;
  error?: string;
  stopped?: boolean;
}

export function isProcessActive(state?: InstanceProcessState): boolean {
  return !!state && ["starting", "running", "stopping"].includes(state.status);
}

export function validateLaunchSettings(settings: LaunchSettings): void {
  if (
    !settings ||
    !Number.isInteger(settings.minMemory) ||
    !Number.isInteger(settings.maxMemory) ||
    settings.minMemory < 256 ||
    settings.maxMemory < settings.minMemory ||
    settings.maxMemory > 65536
  ) {
    throw new Error(
      "記憶體必須介於 256 MB 至 65536 MB，且最大值不可小於最小值",
    );
  }
  if (
    !Array.isArray(settings.jvmArgs) ||
    settings.jvmArgs.some(
      (arg) => typeof arg !== "string" || /[\r\n\0]/.test(arg),
    )
  ) {
    throw new Error("JVM 參數格式不正確，請每行輸入一個參數");
  }
  if (
    settings.javaPathOverride !== undefined &&
    typeof settings.javaPathOverride !== "string"
  ) {
    throw new Error("Java 路徑格式不正確");
  }
  if (
    settings.gpuAdapter !== undefined &&
    (typeof settings.gpuAdapter !== "string" ||
      !/^[0-9A-F]{4}&[0-9A-F]{4}&[0-9A-F]{8}$/i.test(settings.gpuAdapter))
  ) {
    throw new Error("GPU 設定格式不正確");
  }
}

export function validateSettingKeys(
  keys: unknown,
): asserts keys is SettingKey[] {
  if (!Array.isArray(keys) || keys.some((key) => !settingKeys.includes(key))) {
    throw new Error("設定繼承選項不正確");
  }
}

export function resolveLaunchSettings<
  T extends LaunchSettings & { inheritedSettings?: SettingKey[] },
>(instance: T, global: GlobalSettings): T {
  const resolved = { ...instance };
  const useGlobal = (key: SettingKey): boolean =>
    global.forcedSettings.includes(key) ||
    !!instance.inheritedSettings?.includes(key);
  if (useGlobal("memory")) {
    resolved.minMemory = global.minMemory;
    resolved.maxMemory = global.maxMemory;
  }
  if (useGlobal("jvmArgs")) resolved.jvmArgs = [...global.jvmArgs];
  if (useGlobal("javaPathOverride"))
    resolved.javaPathOverride = global.javaPathOverride;
  if (useGlobal("gpuAdapter")) resolved.gpuAdapter = global.gpuAdapter;
  return resolved;
}
