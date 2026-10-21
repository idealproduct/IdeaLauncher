import { randomUUID } from "crypto";
import type {
  ContentKind,
  DownloadTask,
  RestrictedDownload,
} from "../../../shared/content";

export class AwaitingDownloadFiles extends Error {}
export interface DownloadContext {
  id: string;
  update(patch: Partial<Omit<DownloadTask, "id" | "createdAt">>): void;
  requireFiles(files: RestrictedDownload[]): void;
}
interface Entry {
  task: DownloadTask;
  work: (context: DownloadContext) => Promise<{ instanceId?: string } | void>;
  cleanup?: () => Promise<void>;
}

// Work lives in the main process, independent of any page or renderer subscription.
// Waiting for manual files releases the queue so other downloads can continue.
export class DownloadQueue {
  private entries = new Map<string, Entry>();
  private running = false;
  constructor(private readonly changed: (tasks: DownloadTask[]) => void) {}

  snapshot(): DownloadTask[] {
    return structuredClone(
      [...this.entries.values()].map((entry) => entry.task),
    );
  }
  get(id: string): DownloadTask {
    const task = this.entries.get(id)?.task;
    if (!task) throw new Error("找不到下載項目");
    return structuredClone(task);
  }
  private publish(): void {
    this.changed(this.snapshot());
  }
  enqueue(
    name: string,
    kind: ContentKind,
    work: Entry["work"],
    cleanup?: Entry["cleanup"],
  ): string {
    if (this.entries.size >= 100) {
      const oldest = [...this.entries.values()].find((entry) =>
        ["complete", "failed"].includes(entry.task.status),
      );
      if (oldest) this.entries.delete(oldest.task.id);
      else throw new Error("下載佇列已滿，請等待目前項目完成");
    }
    const id = randomUUID(),
      now = Date.now();
    this.entries.set(id, {
      task: {
        id,
        name,
        kind,
        status: "queued",
        message: "已加入下載佇列",
        percent: 0,
        completedFiles: 0,
        totalFiles: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        createdAt: now,
        updatedAt: now,
        restrictedFiles: [],
      },
      work,
      cleanup,
    });
    this.publish();
    queueMicrotask(() => void this.drain());
    return id;
  }
  update(id: string, patch: Parameters<DownloadContext["update"]>[0]): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error("找不到下載項目");
    entry.task = {
      ...entry.task,
      ...patch,
      id,
      createdAt: entry.task.createdAt,
      updatedAt: Date.now(),
    };
    entry.task.percent = Math.max(0, Math.min(100, entry.task.percent));
    this.publish();
  }
  resume(id: string): void {
    if (this.get(id).status !== "waiting")
      throw new Error("此項目目前不在等待檔案");
    this.update(id, {
      status: "queued",
      message: "本機檔案已就緒，等待接續安裝",
    });
    queueMicrotask(() => void this.drain());
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const entry = [...this.entries.values()].find(
          (entry) => entry.task.status === "queued",
        );
        if (!entry) break;
        const id = entry.task.id;
        const context: DownloadContext = {
          id,
          update: (patch) => this.update(id, patch),
          requireFiles: (files) => {
            this.update(id, { restrictedFiles: files });
            const missing = files.filter((file) => !file.received);
            if (missing.length) {
              this.update(id, {
                message: `共 ${files.length} 個檔案需由 CurseForge 下載，尚缺 ${missing.length} 個`,
              });
              throw new AwaitingDownloadFiles();
            }
          },
        };
        this.update(id, {
          status: "preparing",
          message: "檢查版本與必要依賴…",
        });
        let paused = false;
        try {
          const result = await entry.work(context);
          this.update(id, {
            status: "complete",
            message: "安裝完成",
            percent: 100,
            instanceId: result?.instanceId ?? entry.task.instanceId,
            currentFile: undefined,
          });
        } catch (error) {
          paused = error instanceof AwaitingDownloadFiles;
          this.update(id, {
            status: paused ? "waiting" : "failed",
            ...(paused
              ? {}
              : {
                  message:
                    error instanceof Error ? error.message : "下載或安裝失敗",
                }),
          });
        } finally {
          if (!paused) {
            await entry.cleanup?.().catch(() => undefined);
            entry.cleanup = undefined;
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
