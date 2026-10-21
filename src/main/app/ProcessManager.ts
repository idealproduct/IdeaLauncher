import { execFile, type ChildProcess } from "child_process";
import {
  isProcessActive,
  type InstanceProcessState,
} from "../../shared/launcher";

interface ProcessEntry {
  state: InstanceProcessState;
  child?: ChildProcess;
  abort: AbortController;
}

// Only children created by this launcher are eligible for termination.
export async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        (error) => {
          if (error && child.exitCode === null && child.signalCode === null)
            reject(error);
          else resolve();
        },
      );
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

export class ProcessManager {
  private entries = new Map<string, ProcessEntry>();

  constructor(
    private readonly onChange: (state: InstanceProcessState) => void,
    private readonly killTree = killProcessTree,
  ) {}

  getStates(): InstanceProcessState[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.state }));
  }

  isActive(id: string): boolean {
    return isProcessActive(this.entries.get(id)?.state);
  }

  private update(
    entry: ProcessEntry,
    patch: Partial<InstanceProcessState>,
  ): void {
    if (this.entries.get(entry.state.instanceId) !== entry) return;
    entry.state = { ...entry.state, ...patch };
    this.onChange({ ...entry.state });
  }

  async launch(
    id: string,
    spawn: (signal: AbortSignal) => Promise<ChildProcess>,
  ): Promise<void> {
    if (this.isActive(id)) throw new Error("此實例已在啟動或執行中");
    const entry: ProcessEntry = {
      state: {
        instanceId: id,
        status: "starting",
        startedAt: new Date().toISOString(),
      },
      abort: new AbortController(),
    };
    this.entries.set(id, entry);
    this.onChange({ ...entry.state });
    try {
      const child = await spawn(entry.abort.signal);
      entry.child = child;
      child.once("error", (error) =>
        this.update(entry, {
          status: child.pid && child.exitCode === null ? "running" : "failed",
          error: error.message,
        }),
      );
      child.once("exit", (code) => {
        if (entry.state.status === "failed") return;
        this.update(entry, {
          status:
            !entry.abort.signal.aborted && code !== 0 ? "failed" : "exited",
          exitCode: code,
          stopped: entry.abort.signal.aborted,
          error:
            !entry.abort.signal.aborted && code !== 0
              ? `遊戲意外結束（退出碼 ${code ?? "unknown"}）`
              : undefined,
        });
      });
      if (!child.pid) throw new Error("無法建立遊戲程序");
      if (child.exitCode !== null || child.signalCode !== null) {
        this.update(entry, {
          status: child.exitCode === 0 ? "exited" : "failed",
          exitCode: child.exitCode,
        });
        return;
      }
      this.update(entry, {
        pid: child.pid,
        status: entry.abort.signal.aborted ? "stopping" : "running",
      });
      if (entry.abort.signal.aborted) await this.killTree(child);
    } catch (error) {
      if (
        entry.child?.pid &&
        entry.child.exitCode === null &&
        entry.child.signalCode === null
      ) {
        entry.abort = new AbortController();
        this.update(entry, {
          status: "running",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      this.update(entry, {
        status: entry.abort.signal.aborted ? "exited" : "failed",
        stopped: entry.abort.signal.aborted,
        error: entry.abort.signal.aborted
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      });
      throw error;
    }
  }

  async stop(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || !this.isActive(id)) throw new Error("此實例沒有執行中的程序");
    if (entry.state.status === "stopping") return;
    const previousStatus = entry.state.status;
    this.update(entry, { status: "stopping" });
    if (!entry.child) {
      entry.abort.abort(new Error("啟動已取消"));
      return;
    }
    try {
      entry.abort.abort();
      await this.killTree(entry.child);
    } catch (error) {
      // A failed kill must leave the process controllable and prevent duplicate launches.
      entry.abort = new AbortController();
      if (isProcessActive(entry.state))
        this.update(entry, { status: previousStatus });
      throw error;
    }
  }
}
