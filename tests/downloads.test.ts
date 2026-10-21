import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DownloadQueue } from "../src/main/app/content/DownloadQueue";
import { DownloadSettingsStore } from "../src/main/app/content/DownloadSettingsStore";
import {
  restrictedDownloads,
  officialDownloadUrl,
  verifyCurseFile,
} from "../src/main/app/content/ManualDownloads";
import { downloadContent } from "../src/main/app/content/CurseForge";
import { createHash } from "node:crypto";
import type { DownloadTask } from "../src/shared/content";
import type { InstallFile } from "../src/main/app/content/ContentInstaller";

const restrictedItem = (id: number): InstallFile => ({
  project: {
    id,
    name: `Mod ${id}`,
    kind: "mod",
    summary: "",
    authors: [],
    websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/mod-${id}`,
    downloads: 0,
    available: false,
  },
  file: {
    id: id * 10,
    modId: id,
    displayName: "1.0",
    fileName: `mod-${id}.jar`,
    gameVersions: ["1.21.1", "Fabric"],
    releaseType: 1,
    fileDate: "",
    fileLength: 4,
    isAvailable: true,
    dependencies: [],
    hashes: [
      { algo: 1, value: createHash("sha1").update("test").digest("hex") },
    ],
  },
});

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    get resolve() {
      return resolve;
    },
  };
}
async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("all restricted files are enumerated and deduplicated before any browser consent", () => {
  const one = restrictedItem(1),
    two = restrictedItem(2),
    automatic = restrictedItem(3);
  automatic.project.available = true;
  const results = restrictedDownloads(
    [one, two, automatic, one],
    new Map([[one.file.id, "/downloaded/one.jar"]]),
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].received, true);
  assert.equal(results[1].received, false);
  assert.equal(
    results[1].url,
    "https://www.curseforge.com/minecraft/mc-mods/mod-2/download/20",
  );
  assert.throws(() => officialDownloadUrl("http://www.curseforge.com/mod", 20));
  assert.throws(() =>
    officialDownloadUrl("https://curseforge.com.evil.test/mod", 20),
  );
});

test("batch file validation accepts only the exact pinned file, independent of filename", () => {
  verifyCurseFile(restrictedItem(1), Buffer.from("test"));
  assert.throws(() => verifyCurseFile(restrictedItem(1), Buffer.from("fake")));
  assert.throws(() =>
    verifyCurseFile(restrictedItem(1), Buffer.from("too-long")),
  );
});

test("enqueue returns immediately; jobs continue without a renderer and retain history/progress", async () => {
  const gate = deferred();
  const changes: DownloadTask[][] = [];
  const queue = new DownloadQueue((tasks) => changes.push(tasks));
  const id = queue.enqueue("Background mod", "mod", async (context) => {
    context.update({
      status: "downloading",
      downloadedBytes: 32,
      totalBytes: 64,
      totalFiles: 1,
      percent: 50,
    });
    await gate.promise;
    return { instanceId: "instance-a" };
  });
  assert.equal(queue.get(id).status, "queued");
  await tick();
  assert.equal(queue.get(id).status, "downloading");
  assert.equal(queue.get(id).percent, 50);
  assert.equal(queue.get(id).downloadedBytes, 32);
  gate.resolve();
  await tick();
  assert.equal(queue.get(id).status, "complete");
  assert.equal(queue.get(id).percent, 100);
  assert.equal(queue.get(id).instanceId, "instance-a");
  const snapshot = queue.snapshot();
  snapshot[0].name = "changed";
  assert.equal(queue.get(id).name, "Background mod");
  assert.ok(changes.some((tasks) => tasks[0].status === "downloading"));
});

test("waiting for grouped manual downloads releases the queue; resume completes only after all files arrive", async () => {
  const queue = new DownloadQueue(() => undefined);
  const items = [restrictedItem(1), restrictedItem(2)],
    files = new Map<number, string>();
  let executions = 0;
  const first = queue.enqueue("Restricted pack", "modpack", async (context) => {
    executions++;
    context.requireFiles(restrictedDownloads(items, files));
  });
  const second = queue.enqueue(
    "Automatic resource pack",
    "resourcepack",
    async () => undefined,
  );
  await tick();
  assert.equal(queue.get(first).status, "waiting");
  assert.equal(queue.get(first).restrictedFiles.length, 2);
  assert.equal(queue.get(second).status, "complete");
  files.set(10, "one.jar");
  queue.resume(first);
  await tick();
  assert.equal(queue.get(first).status, "waiting");
  assert.equal(
    queue.get(first).restrictedFiles.filter((file) => file.received).length,
    1,
  );
  files.set(20, "two.jar");
  queue.resume(first);
  await tick();
  assert.equal(queue.get(first).status, "complete");
  assert.equal(executions, 3);
});

test("queued work is serialized, a failed task cannot block later tasks, and cleanup runs once", async () => {
  const gate = deferred();
  const queue = new DownloadQueue(() => undefined);
  let cleanup = 0,
    secondStarted = false;
  const first = queue.enqueue(
    "Failure",
    "mod",
    async () => {
      await gate.promise;
      throw new Error("network failed");
    },
    async () => {
      cleanup++;
    },
  );
  const second = queue.enqueue("Next", "shader", async () => {
    secondStarted = true;
  });
  await tick();
  assert.equal(secondStarted, false);
  assert.equal(queue.get(second).status, "queued");
  gate.resolve();
  await tick();
  assert.equal(queue.get(first).status, "failed");
  assert.equal(queue.get(first).message, "network failed");
  assert.equal(queue.get(second).status, "complete");
  assert.equal(cleanup, 1);
});

test("HTTP byte progress is reported during the stream, not just after the file completes", async () => {
  const gate = deferred();
  const updates: number[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(Buffer.from("te"));
      await gate.promise;
      controller.enqueue(Buffer.from("st"));
      controller.close();
    },
  });
  const result = downloadContent(
    "https://cdn.modrinth.com/test",
    [],
    64,
    async () => new Response(stream, { headers: { "content-length": "4" } }),
    (received, total) => {
      updates.push(received);
      assert.equal(total, 4);
    },
  );
  await tick();
  assert.ok(updates.includes(2));
  gate.resolve();
  assert.equal((await result).toString(), "test");
  assert.equal(updates.at(-1), 4);
});

test("download directory defaults to the OS location, persists changes, and can be reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-download-settings-"));
  try {
    const path = join(root, "settings.json"),
      original = join(root, "Downloads"),
      custom = join(root, "Custom");
    const store = new DownloadSettingsStore(path, original);
    assert.equal((await store.read()).directory, original);
    await store.save(custom);
    assert.equal(
      (await new DownloadSettingsStore(path, original).read()).directory,
      custom,
    );
    assert.equal(JSON.parse(await readFile(path, "utf8")).directory, custom);
    await assert.rejects(store.save("../relative"));
    await store.reset();
    assert.equal((await store.read()).directory, original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
