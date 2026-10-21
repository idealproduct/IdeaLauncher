import { open, readAllEntries, readEntry } from "@xmcl/unzip/dist/index.js";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { PackPreview } from "../../../shared/content";
import { positiveId } from "../../../shared/content";
import { validateDownloadUrl } from "./CurseForge";

export interface PackPlan extends Omit<PackPreview, "token"> {
  overrides: string[];
  curseFiles: { projectID: number; fileID: number }[];
  remoteFiles: {
    path: string;
    hashes: { algorithm: "sha1" | "sha512"; value: string }[];
    downloads: string[];
    fileSize: number;
  }[];
}

export function safeRelativePath(path: string): string {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 1024 ||
    /[\\:\0<>"|?*]/.test(path) ||
    path.startsWith("/")
  )
    throw new Error("模組包包含無效路徑");
  const parts = path.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw new Error("模組包包含不安全的檔案路徑");
  if (
    ["instance.json", ".idealauncher-content.json"].includes(
      parts[0].toLowerCase(),
    )
  )
    throw new Error("模組包不得覆蓋啟動器設定");
  return path;
}

function nonempty(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error("模組包資訊格式不正確");
  return value.trim();
}

export function parsePackManifest(
  raw: unknown,
  format: "curseforge" | "modrinth",
): PackPlan {
  if (!raw || typeof raw !== "object") throw new Error("模組包資訊格式不正確");
  const manifest = raw as Record<string, any>;
  const plan: PackPlan = {
    name: nonempty(manifest.name),
    format,
    minecraftVersion: "",
    loader: "vanilla",
    fileCount: 0,
    needsApiKey: false,
    overrides: [],
    curseFiles: [],
    remoteFiles: [],
  };
  if (!Array.isArray(manifest.files) || manifest.files.length > 10000)
    throw new Error("模組包檔案清單格式不正確");
  if (format === "curseforge") {
    if (
      manifest.manifestType !== "minecraftModpack" ||
      manifest.manifestVersion !== 1
    )
      throw new Error("不支援的 CurseForge 模組包格式");
    plan.minecraftVersion = nonempty(manifest.minecraft?.version);
    const loaders = manifest.minecraft?.modLoaders;
    if (
      !Array.isArray(loaders) ||
      (loaders.length > 1 &&
        loaders.filter((loader) => loader.primary === true).length !== 1)
    )
      throw new Error("模組包載入器設定不明確");
    const loader = loaders.find((loader) => loader.primary) ?? loaders[0];
    if (loader) {
      const match = nonempty(loader.id).match(/^(forge|fabric|neoforge)-(.+)$/);
      if (!match)
        throw new Error(
          "此模組包載入器目前不支援（支援 Forge、Fabric、NeoForge）",
        );
      plan.loader = match[1] as PackPlan["loader"];
      plan.loaderVersion = nonempty(match[2]);
    }
    plan.curseFiles = manifest.files
      .filter((file) => file.required !== false)
      .map((file) => ({
        projectID: positiveId(file.projectID),
        fileID: positiveId(file.fileID),
      }));
    if (
      new Set(plan.curseFiles.map((file) => file.projectID)).size !==
      plan.curseFiles.length
    )
      throw new Error("模組包包含同一專案的重複版本");
    plan.overrides = [safeRelativePath(manifest.overrides ?? "overrides")];
    plan.needsApiKey = plan.curseFiles.length > 0;
  } else {
    if (manifest.formatVersion !== 1 || manifest.game !== "minecraft")
      throw new Error("不支援的 Modrinth 模組包格式");
    plan.minecraftVersion = nonempty(manifest.dependencies?.minecraft);
    const supported = {
      forge: "forge",
      neoforge: "neoforge",
      "fabric-loader": "fabric",
    } as const;
    const loaderKeys = Object.keys(manifest.dependencies).filter(
      (key) => key !== "minecraft",
    );
    if (loaderKeys.length > 1 || loaderKeys.some((key) => !(key in supported)))
      throw new Error("此模組包載入器目前不支援");
    if (loaderKeys.length) {
      plan.loader = supported[loaderKeys[0] as keyof typeof supported];
      plan.loaderVersion = nonempty(manifest.dependencies[loaderKeys[0]]);
    }
    const paths = new Set<string>();
    plan.remoteFiles = manifest.files
      .filter((file) => file.env?.client !== "unsupported")
      .map((file) => {
        const path = safeRelativePath(file.path);
        if (paths.has(path.toLowerCase()))
          throw new Error("模組包包含重複的檔案路徑");
        paths.add(path.toLowerCase());
        if (
          !Array.isArray(file.downloads) ||
          !file.downloads.length ||
          file.downloads.length > 10 ||
          !Number.isSafeInteger(file.fileSize) ||
          file.fileSize < 0 ||
          file.fileSize > 512 * 1024 * 1024
        )
          throw new Error("模組包下載資訊不正確");
        file.downloads.forEach(validateDownloadUrl);
        const hashes = (["sha1", "sha512"] as const).map((algorithm) => {
          const value = file.hashes?.[algorithm];
          if (
            typeof value !== "string" ||
            !(
              algorithm === "sha1" ? /^[a-f0-9]{40}$/i : /^[a-f0-9]{128}$/i
            ).test(value)
          )
            throw new Error("模組包缺少有效的檔案雜湊");
          return { algorithm, value };
        });
        return {
          path,
          downloads: file.downloads,
          hashes,
          fileSize: file.fileSize,
        };
      });
    plan.overrides = ["overrides", "client-overrides"];
  }
  if (
    !/^[A-Za-z0-9_.+-]+$/.test(plan.minecraftVersion) ||
    (plan.loaderVersion && !/^[A-Za-z0-9_.+-]+$/.test(plan.loaderVersion))
  )
    throw new Error("遊戲或載入器版本格式不正確");
  plan.fileCount = plan.curseFiles.length + plan.remoteFiles.length;
  return plan;
}

export async function inspectPackArchive(
  path: string | Buffer,
): Promise<PackPlan> {
  const zip = await open(path);
  try {
    if (zip.entryCount > 30000) throw new Error("模組包內檔案數量過多");
    const entries = await readAllEntries(zip);
    let total = 0;
    const names = new Set<string>();
    for (const entry of entries) {
      const name = entry.fileName.replace(/\/$/, "");
      safeRelativePath(name);
      if (
        names.has(name.toLowerCase()) ||
        ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000 ||
        entry.isEncrypted()
      )
        throw new Error("模組包包含重複、連結或加密檔案");
      names.add(name.toLowerCase());
      total += entry.uncompressedSize;
      if (total > 4 * 1024 ** 3 || entry.uncompressedSize > 512 * 1024 ** 2)
        throw new Error("模組包解壓縮大小超過限制");
    }
    const cf = entries.find((entry) => entry.fileName === "manifest.json");
    const mr = entries.find(
      (entry) => entry.fileName === "modrinth.index.json",
    );
    if (!!cf === !!mr)
      throw new Error(
        "請選擇含 manifest.json 的 CurseForge ZIP，或含 modrinth.index.json 的 .mrpack",
      );
    const entry = (cf ?? mr)!;
    if (entry.uncompressedSize > 8 * 1024 * 1024)
      throw new Error("模組包資訊檔過大");
    return parsePackManifest(
      JSON.parse((await readEntry(zip, entry)).toString("utf8")),
      cf ? "curseforge" : "modrinth",
    );
  } finally {
    zip.close();
  }
}

export async function extractPackOverrides(
  archive: string | Buffer,
  plan: PackPlan,
  destination: string,
): Promise<void> {
  // Revalidate before extraction; ZIP entries are never used as absolute paths.
  await inspectPackArchive(archive);
  const zip = await open(archive);
  try {
    const entries = await readAllEntries(zip);
    for (const prefix of plan.overrides) {
      for (const entry of entries) {
        if (
          !entry.fileName.startsWith(`${prefix}/`) ||
          entry.fileName.endsWith("/")
        )
          continue;
        const path = safeRelativePath(entry.fileName.slice(prefix.length + 1));
        const target = join(destination, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, await readEntry(zip, entry));
      }
    }
  } finally {
    zip.close();
  }
}
