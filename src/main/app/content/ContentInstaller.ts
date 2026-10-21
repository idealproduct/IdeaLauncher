import { mkdir, readFile, rename, writeFile, lstat, unlink } from "fs/promises";
import { dirname, join, resolve, relative } from "path";
import { createHash, randomUUID } from "crypto";
import {
  isFileCompatible,
  type ContentKind,
  type ContentProject,
  type ContentFile,
} from "../../../shared/content";
import type { InstanceSummary } from "../../../shared/launcher";
import { CurseForgeClient, downloadContent } from "./CurseForge";
import {
  safeRelativePath,
  type PackPlan,
  extractPackOverrides,
} from "./PackArchive";

export interface InstallFile {
  project: ContentProject;
  file: ContentFile;
}
export const contentFolders = {
  mod: "mods",
  shader: "shaderpacks",
  resourcepack: "resourcepacks",
} as const;

export async function resolveRequiredFiles(
  client: CurseForgeClient,
  root: InstallFile,
  instance: Pick<InstanceSummary, "minecraftVersion" | "loader">,
): Promise<InstallFile[]> {
  const found = new Map<number, InstallFile>();
  const visit = async (item: InstallFile): Promise<void> => {
    if (found.has(item.project.id)) return;
    if (found.size > 250) throw new Error("必要依賴數量超過限制");
    if (!isFileCompatible(item.file, instance, item.project.kind))
      throw new Error(`「${item.project.name}」與此實例不相容`);
    found.set(item.project.id, item);
    for (const dependency of item.file.dependencies ?? []) {
      if (dependency.relationType !== 3 || found.has(dependency.modId))
        continue;
      const project = await client.project(dependency.modId);
      if (project.kind === "modpack") throw new Error("必要依賴不可為模組包");
      let selected: ContentFile | undefined;
      for (let index = 0; index < 10000 && !selected; index += 50) {
        const page = await client.files(
          project.id,
          index,
          instance.minecraftVersion,
          project.kind === "mod" ? instance.loader : undefined,
        );
        selected = page.data.find((file) =>
          isFileCompatible(file, instance, project.kind),
        );
        if (index + page.pageSize >= page.totalCount) break;
      }
      if (!selected)
        throw new Error(`找不到必要依賴「${project.name}」的相容版本`);
      await visit({ project, file: selected });
    }
  };
  await visit(root);
  return [...found.values()];
}

export async function fetchCurseFile(
  client: CurseForgeClient,
  item: InstallFile,
  selectLocal?: (item: InstallFile) => Promise<Buffer>,
  onProgress?: (received: number, total?: number) => void,
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(item.file.fileLength) ||
    item.file.fileLength <= 0 ||
    item.file.fileLength > 512 * 1024 ** 2
  )
    throw new Error("檔案大小不正確或超過限制");
  const hashes = (item.file.hashes ?? [])
    .filter((hash) => [1, 2].includes(hash.algo))
    .map((hash) => ({
      algorithm: hash.algo === 1 ? ("sha1" as const) : ("md5" as const),
      value: hash.value,
    }));
  if (!hashes.length) throw new Error("CurseForge 檔案缺少驗證雜湊");
  const buffer =
    !item.project.available && selectLocal
      ? await selectLocal(item)
      : await downloadContent(
          await client.downloadUrl(item.project, item.file),
          hashes,
          512 * 1024 ** 2,
          fetch,
          onProgress,
        );
  if (buffer.length !== item.file.fileLength)
    throw new Error("下載檔案大小與來源不符");
  onProgress?.(buffer.length, item.file.fileLength);
  // Local files must match the exact selected CurseForge version as well.
  if (!item.project.available && selectLocal) {
    for (const hash of hashes) {
      if (
        createHash(hash.algorithm)
          .update(buffer)
          .digest("hex")
          .toLowerCase() !== hash.value.toLowerCase()
      )
        throw new Error("本機檔案與選取版本不符，請下載指定版本");
    }
  }
  return buffer;
}

export async function assertSafeDestination(
  root: string,
  path: string,
): Promise<string> {
  safeRelativePath(path);
  if ((await lstat(root)).isSymbolicLink())
    throw new Error("實例目錄不得為符號連結");
  const target = resolve(root, path);
  const inside = relative(resolve(root), target);
  if (!inside || inside.startsWith(".."))
    throw new Error("目標路徑超出實例目錄");
  let current = resolve(root);
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("目標路徑包含符號連結，無法安裝");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}

interface InstalledRecord {
  projectId: number;
  fileId: number;
  path: string;
  kind: ContentKind;
}

// Download every file before touching an existing instance. Roll back all writes if a commit fails.
export async function commitContentFiles(
  root: string,
  staging: string,
  items: InstallFile[],
): Promise<void> {
  const metadataPath = join(root, ".idealauncher-content.json");
  let records: InstalledRecord[] = [];
  try {
    const parsed = JSON.parse(await readFile(metadataPath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("內容安裝記錄格式不正確");
    for (const record of parsed) {
      if (
        !record ||
        !["mod", "shader", "resourcepack"].includes(record.kind) ||
        typeof record.path !== "string" ||
        !record.path.startsWith(
          `${contentFolders[record.kind as keyof typeof contentFolders]}/`,
        ) ||
        !Number.isSafeInteger(record.projectId) ||
        !Number.isSafeInteger(record.fileId)
      )
        throw new Error("內容安裝記錄格式不正確");
      safeRelativePath(record.path);
    }
    records = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const changes: { target: string; backup?: string; installed: boolean }[] = [];
  const planned = new Set<string>();
  try {
    for (const item of items) {
      if (item.project.kind === "modpack")
        throw new Error("模組包必須安裝為新實例");
      const path = `${contentFolders[item.project.kind]}/${safeRelativePath(item.file.fileName)}`;
      if (item.file.fileName.includes("/") || planned.has(path.toLowerCase()))
        throw new Error("下載檔案名稱重複或不正確");
      if (
        records.some(
          (record) =>
            record.projectId !== item.project.id &&
            record.path.toLowerCase() === path.toLowerCase(),
        )
      )
        throw new Error("檔名與另一個已安裝專案衝突");
      planned.add(path.toLowerCase());
      const obsolete = records.filter(
        (record) =>
          record.projectId === item.project.id && record.path !== path,
      );
      for (const old of obsolete) {
        const target = await assertSafeDestination(root, old.path);
        const backup = join(staging, `backup-${randomUUID()}`);
        try {
          await rename(target, backup);
          changes.push({ target, backup, installed: false });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const target = await assertSafeDestination(root, path);
      await mkdir(dirname(target), { recursive: true });
      const change: (typeof changes)[number] = { target, installed: false };
      const backup = join(staging, `backup-${randomUUID()}`);
      try {
        await rename(target, backup);
        change.backup = backup;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      changes.push(change);
      // Same-volume staging is created within the instance to make commits atomic.
      await rename(join(staging, String(item.file.id)), target);
      change.installed = true;
      records = records.filter(
        (record) => record.projectId !== item.project.id,
      );
      records.push({
        projectId: item.project.id,
        fileId: item.file.id,
        path,
        kind: item.project.kind,
      });
    }
    // Metadata is committed last so failed installs retain the previous inventory.
    const temporary = join(root, `.content-index-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(records, null, 2));
      await rename(temporary, metadataPath);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  } catch (error) {
    for (const change of changes.reverse()) {
      if (change.installed) await unlink(change.target);
      if (change.backup) await rename(change.backup, change.target);
    }
    throw error;
  }
}

export async function populatePack(
  client: CurseForgeClient,
  archive: string | Buffer,
  plan: PackPlan,
  destination: string,
  progress: (message: string, percent: number) => void,
  selectLocal?: (item: InstallFile) => Promise<Buffer>,
  options?: {
    curseFiles?: InstallFile[];
    onBytes?: (
      received: number,
      total: number,
      currentFile: string,
      completedFiles: number,
      totalFiles: number,
    ) => void;
    fetchFile?: (
      item: InstallFile,
      onProgress: (received: number, total?: number) => void,
    ) => Promise<Buffer>;
  },
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const count = plan.curseFiles.length + plan.remoteFiles.length;
  const inventory: InstalledRecord[] = [];
  let done = 0;
  let bytesDone = 0;
  const totalBytes =
    (options?.curseFiles?.reduce(
      (sum, item) => sum + item.file.fileLength,
      0,
    ) ?? 0) + plan.remoteFiles.reduce((sum, file) => sum + file.fileSize, 0);
  for (const reference of plan.curseFiles) {
    const known = options?.curseFiles?.find(
      (item) =>
        item.file.id === reference.fileID &&
        item.project.id === reference.projectID,
    );
    const project =
      known?.project ?? (await client.project(reference.projectID));
    const file =
      known?.file ?? (await client.file(reference.projectID, reference.fileID));
    if (project.kind === "modpack")
      throw new Error("模組包內不得包含其他模組包");
    // Modpacks explicitly pin these file IDs. Do not substitute files or infer
    // loader support from incomplete metadata on older CurseForge releases.
    const filename = safeRelativePath(file.fileName);
    if (filename.includes("/")) throw new Error("檔案名稱不正確");
    const target = join(destination, contentFolders[project.kind], filename);
    await mkdir(dirname(target), { recursive: true });
    const onProgress = (received: number): void =>
      options?.onBytes?.(
        bytesDone + received,
        totalBytes,
        file.fileName,
        done,
        count,
      );
    const data = options?.fetchFile
      ? await options.fetchFile({ project, file }, onProgress)
      : await fetchCurseFile(
          client,
          { project, file },
          selectLocal,
          onProgress,
        );
    await writeFile(target, data);
    bytesDone += data.length;
    inventory.push({
      projectId: project.id,
      fileId: file.id,
      path: `${contentFolders[project.kind]}/${filename}`,
      kind: project.kind,
    });
    progress(
      `下載模組包內容：${++done}/${count} · ${project.name}`,
      Math.round((done / Math.max(count, 1)) * 45),
    );
  }
  for (const file of plan.remoteFiles) {
    let data: Buffer | undefined;
    let failure: unknown;
    for (const url of file.downloads) {
      try {
        data = await downloadContent(
          url,
          file.hashes,
          512 * 1024 ** 2,
          fetch,
          (received) =>
            options?.onBytes?.(
              bytesDone + received,
              totalBytes,
              file.path,
              done,
              count,
            ),
        );
        if (data.length !== file.fileSize)
          throw new Error("模組包檔案大小驗證失敗");
        break;
      } catch (error) {
        data = undefined;
        failure = error;
      }
    }
    if (!data) throw failure ?? new Error("無法下載模組包內容");
    const target = join(destination, safeRelativePath(file.path));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    bytesDone += data.length;
    progress(
      `下載模組包內容：${++done}/${count}`,
      Math.round((done / Math.max(count, 1)) * 45),
    );
  }
  await extractPackOverrides(archive, plan, destination);
  options?.onBytes?.(bytesDone, totalBytes, "", count, count);
  if (inventory.length)
    await writeFile(
      join(destination, ".idealauncher-content.json"),
      JSON.stringify(inventory, null, 2),
    );
}
