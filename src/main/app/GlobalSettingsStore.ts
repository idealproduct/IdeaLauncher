import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname } from "path";
import {
  defaultGlobalSettings,
  validateLaunchSettings,
  validateSettingKeys,
  type GlobalSettings,
} from "../../shared/launcher";

export class GlobalSettingsStore {
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}

  async read(): Promise<GlobalSettings> {
    try {
      const stored = JSON.parse(await readFile(this.path, "utf8"));
      const settings: GlobalSettings = { ...defaultGlobalSettings, ...stored };
      validateLaunchSettings(settings);
      validateSettingKeys(settings.forcedSettings);
      return settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return structuredClone(defaultGlobalSettings);
      throw new Error("無法讀取全域設定，請檢查設定檔", { cause: error });
    }
  }

  async save(settings: GlobalSettings): Promise<GlobalSettings> {
    validateLaunchSettings(settings);
    validateSettingKeys(settings.forcedSettings);
    const normalized: GlobalSettings = {
      minMemory: settings.minMemory,
      maxMemory: settings.maxMemory,
      jvmArgs: settings.jvmArgs.map((arg) => arg.trim()).filter(Boolean),
      javaPathOverride: settings.javaPathOverride?.trim() || undefined,
      gpuAdapter: settings.gpuAdapter?.toUpperCase(),
      forcedSettings: [...new Set(settings.forcedSettings)],
    };
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(
          `${this.path}.tmp`,
          JSON.stringify(normalized, null, 2),
          "utf8",
        );
        await rename(`${this.path}.tmp`, this.path);
      });
    this.writes = write;
    await write;
    return normalized;
  }
}
