import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";

export class DownloadSettingsStore {
  private pending = Promise.resolve();
  constructor(
    private readonly path: string,
    private readonly defaultDirectory: string,
  ) {}
  async read(): Promise<{ directory: string }> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8"));
      if (typeof value.directory !== "string" || !isAbsolute(value.directory))
        throw new Error("下載資料夾設定不正確");
      return { directory: value.directory };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { directory: this.defaultDirectory };
      throw error;
    }
  }
  async save(directory: string): Promise<{ directory: string }> {
    if (
      typeof directory !== "string" ||
      !isAbsolute(directory) ||
      directory.includes("\0")
    )
      throw new Error("下載資料夾必須是完整路徑");
    const value = { directory: resolve(directory) };
    const pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        await mkdir(value.directory, { recursive: true });
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(`${this.path}.tmp`, JSON.stringify(value, null, 2));
        await rename(`${this.path}.tmp`, this.path);
      });
    this.pending = pending;
    await pending;
    return value;
  }
  reset(): Promise<{ directory: string }> {
    return this.save(this.defaultDirectory);
  }
}
