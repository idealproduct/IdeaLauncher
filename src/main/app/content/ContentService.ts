import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  type WebContents,
} from "electron";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { basename, join } from "path";
import { randomUUID } from "crypto";
import { CurseForgeClient, CurseForgeKeyStore } from "./CurseForge";
import {
  inspectPackArchive,
  safeRelativePath,
  type PackPlan,
} from "./PackArchive";
import {
  commitContentFiles,
  fetchCurseFile,
  populatePack,
  resolveRequiredFiles,
  type InstallFile,
} from "./ContentInstaller";
import {
  createManagedInstance,
  readInstance,
  withInstanceContentLock,
} from "../installer/version";
import {
  positiveId,
  isFileCompatible,
  type ContentSearch,
  type PackPreview,
  type ContentKind,
} from "../../../shared/content";
import type { InstanceSummary } from "../../../shared/launcher";
import { DownloadQueue, type DownloadContext } from "./DownloadQueue";
import { DownloadSettingsStore } from "./DownloadSettingsStore";
import { RestrictedBrowser } from "./RestrictedBrowser";
import { restrictedDownloads, verifyCurseFile } from "./ManualDownloads";

interface WorkState {
  root: string;
  directory?: string;
  manual: Map<number, string>;
  cached: Map<number, string>;
  received: Map<number, number>;
  files?: InstallFile[];
  archive?: string;
  plan?: PackPlan;
  baseBytes: number;
  baseFiles: number;
}

export function setupContentIPC(): void {
  const keys = new CurseForgeKeyStore(
    join(app.getPath("userData"), "curseforge-key.enc"),
    safeStorage,
  );
  const client = new CurseForgeClient(() => keys.get());
  const settings = new DownloadSettingsStore(
    join(app.getPath("userData"), "download-settings.json"),
    app.getPath("downloads"),
  );
  const browser = new RestrictedBrowser();
  const workStates = new Map<string, WorkState>();
  const queue = new DownloadQueue((tasks) => {
    for (const task of tasks)
      if (["complete", "failed"].includes(task.status)) browser.finish(task.id);
    const ids = new Set(tasks.map((task) => task.id));
    for (const id of workStates.keys()) if (!ids.has(id)) workStates.delete(id);
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send("downloads:changed", tasks);
  });
  const previews = new Map<
    string,
    { path: string; directory: string; plan: PackPlan; created: number }
  >();
  const parentFor = (sender: WebContents): BrowserWindow | undefined =>
    !sender.isDestroyed()
      ? (BrowserWindow.fromWebContents(sender) ?? undefined)
      : undefined;
  const chooseFiles = async (
    sender: WebContents,
    options: Electron.OpenDialogOptions,
  ): Promise<Electron.OpenDialogReturnValue> => {
    const parent = parentFor(sender);
    return parent
      ? dialog.showOpenDialog(parent, options)
      : dialog.showOpenDialog(options);
  };
  const allocate = async (
    state: WorkState,
    context: DownloadContext,
  ): Promise<string> => {
    if (!state.directory) {
      await mkdir(state.root, { recursive: true });
      state.directory = await mkdtemp(join(state.root, "IdeaLauncher-"));
    }
    context.update({ directory: state.directory });
    return state.directory;
  };
  const requireFiles = (
    state: WorkState,
    context: DownloadContext,
    files: InstallFile[],
  ): void => {
    context.requireFiles(restrictedDownloads(files, state.manual));
  };
  const fetchArtifact = async (
    state: WorkState,
    item: InstallFile,
    progress: (received: number, total?: number) => void,
  ): Promise<Buffer> => {
    const cached =
      state.cached.get(item.file.id) ?? state.manual.get(item.file.id);
    if (cached) {
      const data = await readFile(cached);
      verifyCurseFile(item, data);
      progress(data.length, data.length);
      return data;
    }
    const data = await fetchCurseFile(client, item, undefined, progress);
    const name = safeRelativePath(item.file.fileName);
    if (name.includes("/")) throw new Error("下載檔名不正確");
    const path = join(state.directory!, "files", String(item.file.id), name);
    await mkdir(join(state.directory!, "files", String(item.file.id)), {
      recursive: true,
    });
    await writeFile(path, data);
    state.cached.set(item.file.id, path);
    return data;
  };
  const byteReporter = (state: WorkState, context: DownloadContext) => {
    let lastUpdate = 0;
    return (
      received: number,
      total: number,
      currentFile: string,
      completedFiles: number,
      totalFiles: number,
    ): void => {
      const now = Date.now();
      if (now - lastUpdate < 120 && received < total) return;
      lastUpdate = now;
      const bytes = state.baseBytes + received,
        allBytes = state.baseBytes + total;
      context.update({
        status: "downloading",
        message: "正在下載內容…",
        currentFile,
        downloadedBytes: bytes,
        totalBytes: allBytes,
        completedFiles: state.baseFiles + completedFiles,
        totalFiles: state.baseFiles + totalFiles,
        percent: allBytes ? Math.min(89, (bytes / allBytes) * 89) : 0,
      });
    };
  };
  const resolvePackFiles = async (plan: PackPlan): Promise<InstallFile[]> => {
    const files: InstallFile[] = [];
    // Complete the entire inventory before asking about any restricted files.
    for (let index = 0; index < plan.curseFiles.length; index += 5) {
      files.push(
        ...(await Promise.all(
          plan.curseFiles.slice(index, index + 5).map(async (reference) => {
            const [project, file] = await Promise.all([
              client.project(reference.projectID),
              client.file(reference.projectID, reference.fileID),
            ]);
            if (project.kind === "modpack")
              throw new Error("模組包不可包含另一個模組包");
            return { project, file };
          }),
        )),
      );
    }
    return files;
  };
  const runPack = async (
    state: WorkState,
    context: DownloadContext,
    sender: WebContents,
    name: string,
  ): Promise<{ instanceId: string }> => {
    const directory = await allocate(state, context);
    state.plan ??= await inspectPackArchive(state.archive!);
    state.files ??= await resolvePackFiles(state.plan);
    const contentBytes =
      state.files.reduce((sum, item) => sum + item.file.fileLength, 0) +
      state.plan.remoteFiles.reduce((sum, file) => sum + file.fileSize, 0);
    context.update({
      totalBytes: state.baseBytes + contentBytes,
      totalFiles:
        state.baseFiles + state.files.length + state.plan.remoteFiles.length,
    });
    requireFiles(state, context, state.files);
    const staging = join(directory, ".pack-staging");
    try {
      await populatePack(
        client,
        state.archive!,
        state.plan,
        staging,
        () => undefined,
        undefined,
        {
          curseFiles: state.files,
          onBytes: byteReporter(state, context),
          fetchFile: (item, progress) => fetchArtifact(state, item, progress),
        },
      );
      const files =
        state.baseFiles + state.files.length + state.plan.remoteFiles.length;
      context.update({
        status: "installing",
        message: "安裝 Minecraft 與指定載入器…",
        percent: 90,
        currentFile: undefined,
        completedFiles: files,
        downloadedBytes: state.baseBytes + contentBytes,
      });
      const result = await createManagedInstance(
        sender,
        {
          name,
          version: state.plan.minecraftVersion,
          loader: state.plan.loader,
          loaderVersion: state.plan.loaderVersion,
          launchAfterInstall: false,
        },
        async (instance) => {
          context.update({ message: "套用模組包檔案…", percent: 99 });
          await cp(staging, instance.gamePath, { recursive: true });
        },
        (percent) =>
          context.update({
            status: "installing",
            percent: Math.min(99, 90 + percent * 0.09),
          }),
      );
      return { instanceId: result.instance.id };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  };
  const enqueue = async (
    name: string,
    kind: ContentKind,
    run: (
      state: WorkState,
      context: DownloadContext,
    ) => Promise<{ instanceId?: string }>,
  ): Promise<{ taskId: string }> => {
    const state: WorkState = {
      root: (await settings.read()).directory,
      manual: new Map(),
      cached: new Map(),
      received: new Map(),
      baseBytes: 0,
      baseFiles: 0,
    };
    const taskId = queue.enqueue(name, kind, (context) => run(state, context));
    workStates.set(taskId, state);
    return { taskId };
  };

  ipcMain.handle("downloads:list", () => queue.snapshot());
  ipcMain.handle("downloads:settings", () => settings.read());
  ipcMain.handle("downloads:choose-directory", async (event) => {
    const result = await chooseFiles(event.sender, {
      title: "選擇下載資料夾",
      defaultPath: (await settings.read()).directory,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled || !result.filePaths[0]
      ? settings.read()
      : settings.save(result.filePaths[0]);
  });
  ipcMain.handle("downloads:reset-directory", () => settings.reset());
  ipcMain.handle("downloads:open-directory", async (_event, id?: string) => {
    const directory = id
      ? queue.get(id).directory
      : (await settings.read()).directory;
    if (!directory) throw new Error("下載資料夾尚未建立");
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error("無法開啟下載資料夾");
  });
  const recordLocal = async (
    id: string,
    fileId: number,
    path: string,
  ): Promise<void> => {
    const state = workStates.get(id);
    const item = state?.files?.find((item) => item.file.id === fileId);
    if (!state || !item || queue.get(id).status !== "waiting")
      throw new Error("此下載項目已不在等待檔案");
    if ((await stat(path)).size !== item.file.fileLength)
      throw new Error(`「${item.project.name}」檔案大小與指定版本不符`);
    verifyCurseFile(item, await readFile(path));
    state.manual.set(fileId, path);
    state.received.set(fileId, item.file.fileLength);
    const files = restrictedDownloads(state.files!, state.manual);
    queue.update(id, {
      restrictedFiles: files,
      completedFiles:
        state.baseFiles +
        state.files!.filter((item) => state.manual.has(item.file.id)).length,
      message: `已取得 ${files.filter((file) => file.received).length}/${files.length} 個受限檔案`,
    });
    if (files.every((file) => file.received)) queue.resume(id);
  };
  ipcMain.handle("downloads:open-restricted", async (_event, id: string) => {
    const task = queue.get(id),
      state = workStates.get(id);
    if (task.status !== "waiting" || !state?.directory)
      throw new Error("此項目目前不需手動下載");
    const directory = join(state.directory, "manual");
    for (const file of task.restrictedFiles.filter((file) => !file.received))
      await mkdir(join(directory, String(file.fileId)), { recursive: true });
    let last = 0;
    browser.open(task, directory, {
      progress: (file, received) => {
        state.received.set(file.fileId, received);
        if (Date.now() - last < 120) return;
        last = Date.now();
        const downloadedBytes =
          state.baseBytes +
          (state.files ?? []).reduce(
            (sum, item) => sum + (state.received.get(item.file.id) ?? 0),
            0,
          );
        const current = queue.get(id);
        if (current.status === "waiting")
          queue.update(id, {
            downloadedBytes,
            currentFile: file.fileName,
            percent: current.totalBytes
              ? (downloadedBytes / current.totalBytes) * 89
              : 0,
          });
      },
      downloaded: (file, path) => recordLocal(id, file.fileId, path),
      failed: (message) => {
        if (queue.get(id).status === "waiting") queue.update(id, { message });
      },
    });
  });
  ipcMain.handle("downloads:select-files", async (event, id: string) => {
    const state = workStates.get(id);
    if (!state?.files || queue.get(id).status !== "waiting")
      throw new Error("此項目目前不需手動下載");
    const chosen = await chooseFiles(event.sender, {
      title: "一次選取已下載的 CurseForge 檔案",
      defaultPath: state.directory ?? (await settings.read()).directory,
      properties: ["openFile", "multiSelections"],
    });
    if (chosen.canceled) return { matched: 0, rejected: [] as string[] };
    let matched = 0;
    const rejected: string[] = [];
    for (const path of chosen.filePaths) {
      const size = (await stat(path)).size;
      const candidates = state.files.filter(
        (item) =>
          !item.project.available &&
          !state.manual.has(item.file.id) &&
          item.file.fileLength === size,
      );
      if (!candidates.length) {
        rejected.push(basename(path));
        continue;
      }
      const data = await readFile(path);
      const item = candidates.find((item) => {
        try {
          verifyCurseFile(item, data);
          return true;
        } catch {
          return false;
        }
      });
      if (!item) {
        rejected.push(basename(path));
        continue;
      }
      const target = join(
        state.directory!,
        "manual",
        String(item.file.id),
        safeRelativePath(item.file.fileName),
      );
      await mkdir(join(state.directory!, "manual", String(item.file.id)), {
        recursive: true,
      });
      if (path !== target) await copyFile(path, target);
      await recordLocal(id, item.file.id, target);
      matched++;
    }
    return { matched, rejected };
  });

  ipcMain.handle("content:configured", async () => ({
    configured: !!(await keys.get()),
  }));
  ipcMain.handle("content:search", (_event, query: ContentSearch) =>
    client.search(query),
  );
  ipcMain.handle(
    "content:files",
    (
      _event,
      payload: {
        projectId: number;
        index?: number;
        gameVersion?: string;
        loader?: InstanceSummary["loader"];
      },
    ) =>
      client.files(
        payload.projectId,
        payload.index,
        payload.gameVersion,
        payload.loader,
      ),
  );
  ipcMain.handle("content:open-project", async (_event, id: number) => {
    const url = new URL((await client.project(positiveId(id))).websiteUrl);
    if (
      url.protocol !== "https:" ||
      !["curseforge.com", "www.curseforge.com"].includes(url.hostname)
    )
      throw new Error("專案網址不正確");
    await shell.openExternal(url.href);
  });
  ipcMain.handle(
    "content:install",
    (
      _event,
      payload: {
        projectId: number;
        fileId: number;
        instanceId: string;
        name?: string;
        kind?: ContentKind;
      },
    ) => {
      positiveId(payload.projectId);
      positiveId(payload.fileId);
      return enqueue(
        payload.name?.slice(0, 200) || "內容安裝",
        payload.kind ?? "mod",
        async (state, context) => {
          await allocate(state, context);
          if (!state.files) {
            const [project, file, instance] = await Promise.all([
              client.project(payload.projectId),
              client.file(payload.projectId, payload.fileId),
              readInstance(payload.instanceId),
            ]);
            if (project.kind === "modpack")
              throw new Error("模組包須使用新實例安裝");
            state.files = await resolveRequiredFiles(
              client,
              { project, file },
              instance,
            );
            context.update({
              name: project.name,
              kind: project.kind,
              instanceId: instance.id,
            });
          }
          const total = state.files.reduce(
            (sum, item) => sum + item.file.fileLength,
            0,
          );
          context.update({ totalBytes: total, totalFiles: state.files.length });
          requireFiles(state, context, state.files);
          return withInstanceContentLock(
            payload.instanceId,
            async (instance) => {
              // Recheck compatibility after waiting; users can edit or remove instances meanwhile.
              if (
                state.files!.some(
                  (item) =>
                    !isFileCompatible(item.file, instance, item.project.kind),
                )
              )
                throw new Error("此實例已不符合所選檔案版本");
              const staging = await mkdtemp(
                join(instance.gamePath, ".content-stage-"),
              );
              try {
                const report = byteReporter(state, context);
                let bytes = 0;
                for (const [index, item] of state.files!.entries()) {
                  const data = await fetchArtifact(state, item, (received) =>
                    report(
                      bytes + received,
                      total,
                      item.file.fileName,
                      index,
                      state.files!.length,
                    ),
                  );
                  await writeFile(join(staging, String(item.file.id)), data);
                  bytes += data.length;
                }
                context.update({
                  status: "installing",
                  message: "將已驗證的檔案安裝至實例…",
                  percent: 95,
                  completedFiles: state.files!.length,
                  downloadedBytes: total,
                });
                await commitContentFiles(
                  instance.gamePath,
                  staging,
                  state.files!,
                );
                return { instanceId: instance.id };
              } finally {
                await rm(staging, { recursive: true, force: true });
              }
            },
          );
        },
      );
    },
  );
  ipcMain.handle(
    "content:enqueue-pack",
    (event, payload: { projectId: number; fileId: number; name: string }) => {
      positiveId(payload.projectId);
      positiveId(payload.fileId);
      if (!payload.name?.trim() || payload.name.length > 120)
        throw new Error("請輸入 1–120 字的實例名稱");
      return enqueue(payload.name, "modpack", async (state, context) => {
        await allocate(state, context);
        if (!state.archive) {
          const [project, file] = await Promise.all([
            client.project(payload.projectId),
            client.file(payload.projectId, payload.fileId),
          ]);
          if (project.kind !== "modpack") throw new Error("此專案不是模組包");
          state.files = [{ project, file }];
          context.update({ totalBytes: file.fileLength, totalFiles: 1 });
          requireFiles(state, context, state.files);
          const report = byteReporter(state, context);
          await fetchArtifact(state, { project, file }, (received) =>
            report(received, file.fileLength, file.fileName, 0, 1),
          );
          state.archive =
            state.cached.get(file.id) ?? state.manual.get(file.id)!;
          state.baseBytes = file.fileLength;
          state.baseFiles = 1;
          state.files = undefined;
        }
        return runPack(state, context, event.sender, payload.name.trim());
      });
    },
  );
  const cleanPreview = async (token: string): Promise<void> => {
    const value = previews.get(token);
    if (!value) return;
    previews.delete(token);
    await rm(value.directory, { recursive: true, force: true });
  };
  ipcMain.handle(
    "content:prepare-pack",
    async (event): Promise<PackPreview | null> => {
      for (const [token, value] of previews)
        if (Date.now() - value.created > 30 * 60_000) await cleanPreview(token);
      if (previews.size >= 5) throw new Error("請先關閉其他模組包預覽");
      const selected = await chooseFiles(event.sender, {
        title: "匯入外部模組包",
        properties: ["openFile"],
        filters: [{ name: "Minecraft 模組包", extensions: ["zip", "mrpack"] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      if ((await stat(selected.filePaths[0])).size > 512 * 1024 ** 2)
        throw new Error("模組包超過 512 MB 限制");
      const directory = await mkdtemp(
          join(app.getPath("temp"), "idea-pack-preview-"),
        ),
        path = join(directory, "pack.zip");
      try {
        await copyFile(selected.filePaths[0], path);
        const plan = await inspectPackArchive(path),
          token = randomUUID();
        previews.set(token, { path, directory, plan, created: Date.now() });
        return {
          token,
          name: plan.name,
          format: plan.format,
          minecraftVersion: plan.minecraftVersion,
          loader: plan.loader,
          loaderVersion: plan.loaderVersion,
          fileCount: plan.fileCount,
          needsApiKey: plan.needsApiKey,
        };
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
  );
  ipcMain.handle("content:discard-pack", (_event, token: string) =>
    cleanPreview(token),
  );
  ipcMain.handle(
    "content:import-pack",
    async (event, payload: { token: string; name: string }) => {
      const preview = previews.get(payload.token);
      if (!preview || Date.now() - preview.created > 30 * 60_000)
        throw new Error("匯入預覽已過期");
      if (!payload.name?.trim() || payload.name.length > 120)
        throw new Error("請輸入 1–120 字的實例名稱");
      previews.delete(payload.token);
      const result = await enqueue(
        payload.name,
        "modpack",
        async (state, context) => {
          const directory = await allocate(state, context);
          if (!state.archive) {
            state.archive = join(directory, "imported-pack.zip");
            await copyFile(preview.path, state.archive);
            state.plan = preview.plan;
            await rm(preview.directory, { recursive: true, force: true });
          }
          return runPack(state, context, event.sender, payload.name.trim());
        },
      );
      return result;
    },
  );
}
