import { BrowserWindow, Menu, session, WebContentsView } from "electron";
import { join } from "path";
import type { DownloadTask, RestrictedDownload } from "../../../shared/content";
import { safeRelativePath } from "./PackArchive";

// One browser window owns all requested pages. No app preload or API key is
// exposed to these remote pages; files originate from normal website downloads.
export class RestrictedBrowser {
  private windows = new Map<string, BrowserWindow>();
  private pageIds = new Map<string, Set<number>>();
  private reloadPending = new Map<string, () => void>();
  constructor(
    private readonly options: {
      show?: boolean;
      createSession?: (partition: string) => Electron.Session;
    } = {},
  ) {}
  finish(taskId: string): void {
    const window = this.windows.get(taskId);
    if (window && !window.isDestroyed()) window.destroy();
  }

  open(
    task: DownloadTask,
    directory: string,
    callbacks: {
      progress: (
        file: RestrictedDownload,
        received: number,
        total: number,
      ) => void;
      downloaded: (file: RestrictedDownload, path: string) => Promise<void>;
      failed: (message: string) => void;
    },
  ): void {
    const files = task.restrictedFiles.filter((file) => !file.received);
    if (!files.length) throw new Error("此項目沒有待下載的受限檔案");
    const existing = this.windows.get(task.id);
    if (existing && !existing.isDestroyed()) {
      if (files.every((file) => this.pageIds.get(task.id)?.has(file.fileId))) {
        existing.show();
        existing.focus();
        this.reloadPending.get(task.id)?.();
        return;
      }
      existing.destroy();
    }
    const partition = `curseforge-download-${task.id}-${Date.now()}`;
    const browserSession =
      this.options.createSession?.(partition) ??
      session.fromPartition(partition);
    browserSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    const window = new BrowserWindow({
      show: this.options.show ?? true,
      width: 1100,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      title: `CurseForge 批次下載 · ${files.length} 個檔案`,
      backgroundColor: "#101d26",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.windows.set(task.id, window);
    this.pageIds.set(task.id, new Set(files.map((file) => file.fileId)));
    const views = files.map((file) => ({
      file,
      view: new WebContentsView({
        webPreferences: {
          session: browserSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      }),
    }));
    let selected = views[0];
    const active = new Set<number>();
    this.reloadPending.set(task.id, () => {
      for (const { file, view } of views)
        if (
          !file.received &&
          !active.has(file.fileId) &&
          !view.webContents.isDestroyed()
        )
          view.webContents.reload();
    });
    const fit = (): void => {
      const [width, height] = window.getContentSize();
      selected.view.setBounds({ x: 0, y: 0, width, height });
    };
    const select = (item: typeof selected): void => {
      if (selected !== item) window.contentView.removeChildView(selected.view);
      selected = item;
      window.contentView.addChildView(item.view);
      window.setTitle(
        `CurseForge · ${item.file.projectName} · 共 ${files.length} 個下載頁`,
      );
      fit();
    };
    window.setMenu(
      Menu.buildFromTemplate([
        {
          label: `下載頁面（${files.length}）`,
          submenu: views.map((item) => ({
            label: item.file.projectName.replace(/&/g, "&&"),
            click: () => select(item),
          })),
        },
        {
          label: "重新載入目前頁面",
          click: () => selected.view.webContents.reload(),
        },
        { label: "關閉下載視窗", click: () => window.close() },
      ]),
    );
    window.on("resize", fit);
    browserSession.on("will-download", (event, item, contents) => {
      const match = views.find(
        (value) => value.view.webContents.id === contents.id,
      );
      if (!match || active.has(match.file.fileId) || match.file.received) {
        event.preventDefault();
        return;
      }
      let name: string;
      try {
        name = safeRelativePath(match.file.fileName);
      } catch {
        event.preventDefault();
        callbacks.failed("下載檔名不正確");
        return;
      }
      if (
        name.includes("/") ||
        item.getFilename().toLowerCase() !== name.toLowerCase()
      ) {
        event.preventDefault();
        callbacks.failed(
          `下載檔名與「${match.file.projectName}」的指定版本不符`,
        );
        return;
      }
      // Each official page owns a unique file-ID subdirectory, avoiding collisions.
      item.setSavePath(join(directory, String(match.file.fileId), name));
      active.add(match.file.fileId);
      item.on("updated", () =>
        callbacks.progress(
          match.file,
          item.getReceivedBytes(),
          item.getTotalBytes(),
        ),
      );
      item.once("done", (_event, state) => {
        if (state === "completed")
          void callbacks
            .downloaded(match.file, item.getSavePath())
            .then(() => {
              match.file.received = true;
            })
            .catch((error) =>
              callbacks.failed(
                error instanceof Error ? error.message : "檔案驗證失敗",
              ),
            )
            .finally(() => active.delete(match.file.fileId));
        else {
          active.delete(match.file.fileId);
          callbacks.failed(
            `「${match.file.projectName}」下載未完成，可重新開啟頁面下載`,
          );
        }
      });
    });
    window.on("close", (event) => {
      if (active.size) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on("closed", () => {
      if (this.windows.get(task.id) === window) {
        this.windows.delete(task.id);
        this.pageIds.delete(task.id);
        this.reloadPending.delete(task.id);
      }
      for (const { view } of views)
        if (!view.webContents.isDestroyed()) view.webContents.close();
    });
    select(selected);
    for (const { file, view } of views) {
      view.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const target = new URL(url);
          if (
            target.protocol === "https:" &&
            target.hostname.endsWith(".forgecdn.net")
          )
            view.webContents.downloadURL(url);
          else if (
            target.protocol === "https:" &&
            ["www.curseforge.com", "curseforge.com"].includes(target.hostname)
          )
            void view.webContents.loadURL(url).catch(() => undefined);
        } catch {
          /* Reject unrelated popups. */
        }
        return { action: "deny" };
      });
      view.webContents.on("will-navigate", (event, url) => {
        try {
          const target = new URL(url);
          if (
            target.protocol !== "https:" ||
            !(
              ["www.curseforge.com", "curseforge.com"].includes(
                target.hostname,
              ) || target.hostname.endsWith(".forgecdn.net")
            )
          )
            event.preventDefault();
        } catch {
          event.preventDefault();
        }
      });
      void view.webContents
        .loadURL(file.url)
        .catch(() =>
          callbacks.failed(`「${file.projectName}」下載頁載入失敗，請重試`),
        );
    }
  }
}
