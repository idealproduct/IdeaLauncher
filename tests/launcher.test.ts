import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ProcessManager,
  killProcessTree,
} from "../src/main/app/ProcessManager";
import { GlobalSettingsStore } from "../src/main/app/GlobalSettingsStore";
import {
  defaultGlobalSettings,
  resolveLaunchSettings,
  validateLaunchSettings,
  validateSettingKeys,
  type InstanceProcessState,
} from "../src/shared/launcher";

function childStub(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null,
    signalCode: null,
  }) as ChildProcess;
}

test("legacy custom values remain unchanged; inherited groups use the latest global values", () => {
  const local = {
    minMemory: 512,
    maxMemory: 2048,
    jvmArgs: ["-Dlocal=true"],
    gpuAdapter: undefined,
  };
  const global = {
    ...defaultGlobalSettings,
    minMemory: 2048,
    maxMemory: 8192,
    jvmArgs: ["-Dglobal=true"],
    gpuAdapter: "10DE&1234&00000001",
  };
  assert.deepEqual(resolveLaunchSettings(local, global), local);
  const resolved = resolveLaunchSettings(
    {
      ...local,
      inheritedSettings: ["memory", "gpuAdapter"] as const as [
        "memory",
        "gpuAdapter",
      ],
    },
    global,
  );
  assert.equal(resolved.maxMemory, 8192);
  assert.equal(resolved.gpuAdapter, global.gpuAdapter);
  assert.deepEqual(resolved.jvmArgs, local.jvmArgs);
});

test("forced global values win, and removing the force restores custom values", () => {
  const local = {
    minMemory: 512,
    maxMemory: 2048,
    jvmArgs: [],
    gpuAdapter: "10DE&1234&00000001",
  };
  const global = {
    ...defaultGlobalSettings,
    forcedSettings: ["gpuAdapter"] as ["gpuAdapter"],
  };
  assert.equal(resolveLaunchSettings(local, global).gpuAdapter, undefined);
  assert.equal(
    resolveLaunchSettings(local, { ...global, forcedSettings: [] }).gpuAdapter,
    local.gpuAdapter,
  );
  assert.equal(local.gpuAdapter, "10DE&1234&00000001");
});

test("inherited JVM arguments and automatic Java are resolved without mutating stored values", () => {
  const local = {
    ...defaultGlobalSettings,
    javaPathOverride: "custom-java",
    inheritedSettings: ["jvmArgs", "javaPathOverride"] as [
      "jvmArgs",
      "javaPathOverride",
    ],
  };
  const global = { ...defaultGlobalSettings, jvmArgs: ["-Dglobal=true"] };
  const resolved = resolveLaunchSettings(local, global);
  assert.equal(resolved.javaPathOverride, undefined);
  resolved.jvmArgs.push("-Dextra=true");
  assert.deepEqual(global.jvmArgs, ["-Dglobal=true"]);
  assert.equal(local.javaPathOverride, "custom-java");
});

test("settings validation rejects invalid memory, GPU IDs, arguments and inheritance keys", () => {
  assert.throws(() =>
    validateLaunchSettings({ ...defaultGlobalSettings, maxMemory: 256 }),
  );
  assert.throws(() =>
    validateLaunchSettings({ ...defaultGlobalSettings, minMemory: 512.5 }),
  );
  assert.throws(() =>
    validateLaunchSettings({ ...defaultGlobalSettings, gpuAdapter: "bad" }),
  );
  assert.throws(() =>
    validateLaunchSettings({ ...defaultGlobalSettings, jvmArgs: ["a\nb"] }),
  );
  assert.throws(() => validateSettingKeys(["unknown"]));
});

test("global settings survive store recreation, concurrent saves, and explicit automatic GPU", async () => {
  const directory = await mkdtemp(join(tmpdir(), "idea-settings-test-"));
  const path = join(directory, "settings.json");
  try {
    const store = new GlobalSettingsStore(path);
    assert.deepEqual(await store.read(), defaultGlobalSettings);
    await Promise.all([
      store.save({
        ...defaultGlobalSettings,
        maxMemory: 8192,
        gpuAdapter: "10DE&1234&00000001",
      }),
      store.save({
        ...defaultGlobalSettings,
        maxMemory: 6144,
        forcedSettings: ["memory"],
      }),
    ]);
    const reloaded = await new GlobalSettingsStore(path).read();
    assert.equal(reloaded.maxMemory, 6144);
    assert.equal(reloaded.gpuAdapter, undefined);
    assert.deepEqual(reloaded.forcedSettings, ["memory"]);
    await assert.rejects(
      store.save({ ...defaultGlobalSettings, maxMemory: 0 }),
    );
    assert.equal(JSON.parse(await readFile(path, "utf8")).maxMemory, 6144);
    await writeFile(path, "{invalid");
    await assert.rejects(store.read());
  } finally {
    await unlink(path).catch(() => undefined);
    await rmdir(directory);
  }
});

test("process lifecycle prevents duplicate launch, tracks PID, and permits relaunch after exit", async () => {
  const events: InstanceProcessState[] = [];
  const manager = new ProcessManager((state) => events.push(state));
  let release!: (child: ChildProcess) => void;
  const pending = manager.launch(
    "one",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  assert.equal(manager.getStates()[0].status, "starting");
  await assert.rejects(manager.launch("one", async () => childStub()));
  const child = childStub();
  release(child);
  await pending;
  assert.equal(manager.getStates()[0].status, "running");
  assert.equal(manager.getStates()[0].pid, child.pid);
  child.emit("exit", 0);
  assert.equal(manager.getStates()[0].status, "exited");
  await manager.launch("one", async () => childStub());
  child.emit("error", new Error("late event from previous run"));
  assert.equal(manager.getStates()[0].status, "running");
  assert.deepEqual(
    events.slice(0, 3).map((state) => state.status),
    ["starting", "running", "exited"],
  );
});

test("startup failures and crashes are visible, while unknown process IDs cannot be killed", async () => {
  const manager = new ProcessManager(() => undefined);
  await assert.rejects(
    manager.launch("bad", async () => {
      throw new Error("missing java");
    }),
  );
  assert.equal(manager.getStates()[0].error, "missing java");
  await assert.rejects(manager.stop("unowned-pid"));
  const child = childStub();
  await manager.launch("crash", async () => child);
  child.emit("exit", 1);
  assert.equal(
    manager.getStates().find((state) => state.instanceId === "crash")?.status,
    "failed",
  );
});

test("stop during launch cancels preparation and prevents a late child from escaping", async () => {
  let killed = false;
  const manager = new ProcessManager(
    () => undefined,
    async (child) => {
      killed = true;
      child.emit("exit", null);
    },
  );
  let release!: (child: ChildProcess) => void;
  const pending = manager.launch(
    "one",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await manager.stop("one");
  assert.equal(manager.getStates()[0].status, "stopping");
  release(childStub());
  await pending;
  assert.equal(killed, true);
  assert.equal(manager.getStates()[0].status, "exited");
  assert.equal(manager.getStates()[0].stopped, true);
});

test("failed termination retains running state and allows retry without duplicate spawning", async () => {
  let fail = true;
  const manager = new ProcessManager(
    () => undefined,
    async (child) => {
      if (fail) throw new Error("access denied");
      child.emit("exit", null);
    },
  );
  await manager.launch("one", async () => childStub());
  await assert.rejects(manager.stop("one"));
  assert.equal(manager.getStates()[0].status, "running");
  await assert.rejects(manager.launch("one", async () => childStub()));
  fail = false;
  await manager.stop("one");
  assert.equal(manager.getStates()[0].status, "exited");
});

test("failed termination of a canceled late child also retains control", async () => {
  const manager = new ProcessManager(
    () => undefined,
    async () => {
      throw new Error("kill failed");
    },
  );
  let release!: (child: ChildProcess) => void;
  const pending = manager.launch(
    "one",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await manager.stop("one");
  release(childStub());
  await assert.rejects(pending);
  assert.equal(manager.getStates()[0].status, "running");
  await assert.rejects(manager.launch("one", async () => childStub()));
});

test(
  "real owned process and its descendant are forcibly terminated",
  { timeout: 15000 },
  async () => {
    const manager = new ProcessManager(() => undefined);
    let child: ChildProcess | undefined;
    let descendantPid: number | undefined;
    try {
      await manager.launch("real", async () => {
        child = spawn(
          process.execPath,
          [
            "-e",
            `const { spawn } = require('child_process'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true }); console.log(child.pid); setInterval(() => {}, 1000);`,
          ],
          {
            detached: true,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        child.once("error", () => undefined);
        const [data] = await once(child.stdout!, "data");
        descendantPid = Number(String(data).trim());
        return child;
      });
      assert.equal(manager.getStates()[0].status, "running");
      assert.ok(descendantPid);
      const exit = once(child!, "exit");
      await manager.stop("real");
      await exit;
      assert.equal(manager.getStates()[0].status, "exited");
      assert.throws(() => process.kill(descendantPid!, 0));
    } finally {
      if (child) await killProcessTree(child);
      if (descendantPid) {
        try {
          process.kill(descendantPid, "SIGKILL");
        } catch {
          /* already exited */
        }
      }
    }
  },
);
