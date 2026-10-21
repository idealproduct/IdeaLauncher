// Isolated main-process integration test. All instances/downloads use a unique temp root.
if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const { mkdtempSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join, relative } = require("node:path");
  const testRoot = mkdtempSync(join(tmpdir(), "idea-background-integration-"));
  const env = { ...process.env };
  env.IDEALAUNCHER_DOWNLOADS_SMOKE_ROOT = testRoot;
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require("electron"), [__filename], {
    windowsHide: true,
    env,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode =
    result.status === 0 && result.stdout?.includes("PASS:") ? 0 : 1;
  // Chromium databases are unlocked only after the child has exited.
  const childPath = relative(tmpdir(), testRoot);
  if (
    !childPath.startsWith("idea-background-integration-") ||
    childPath.includes("..")
  )
    throw new Error("Unexpected integration-test cleanup path");
  rmSync(testRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
} else {
  const { app, dialog, ipcMain } = require("electron");
  // Keep the isolated harness alive when replacing its last hidden test window.
  app.on("window-all-closed", () => undefined);
  const { mkdir, writeFile, readFile, readdir } = require("node:fs/promises");
  const { join } = require("node:path");
  const { createHash, randomUUID } = require("node:crypto");
  const assert = require("node:assert/strict");
  const fs = require("node:fs"),
    ts = require("typescript");
  require.extensions[".ts"] = (module, filename) =>
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: filename,
      }).outputText,
      filename,
    );
  let root;
  void app
    .whenReady()
    .then(async () => {
      root = process.env.IDEALAUNCHER_DOWNLOADS_SMOKE_ROOT;
      if (!root)
        throw new Error("Run this integration test through its Node wrapper");
      await mkdir(join(root, "Downloads"));
      await mkdir(join(root, "Data"));
      app.setPath("userData", join(root, "Data"));
      app.setPath("downloads", join(root, "Downloads"));
      const handlers = new Map();
      ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
      const {
        CurseForgeClient,
      } = require("../src/main/app/content/CurseForge.ts");
      const payload = Buffer.from("fixture-download");
      const projects = (id) => ({
        id,
        name: `Fixture ${id}`,
        kind: "mod",
        summary: "",
        authors: [],
        downloads: 0,
        available: ![2, 3].includes(id),
        websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/fixture-${id}`,
      });
      const files = (id) => ({
        id: id * 10,
        modId: id,
        displayName: "1.0",
        fileName: `fixture-${id}.jar`,
        gameVersions: ["1.21.1", "Fabric"],
        releaseType: 1,
        fileDate: "",
        fileLength: payload.length,
        isAvailable: true,
        dependencies:
          id === 1
            ? [
                { modId: 2, relationType: 3 },
                { modId: 3, relationType: 3 },
              ]
            : [],
        hashes: [
          { algo: 1, value: createHash("sha1").update(payload).digest("hex") },
        ],
      });
      CurseForgeClient.prototype.project = async (id) => projects(id);
      CurseForgeClient.prototype.file = async (id) => files(id);
      CurseForgeClient.prototype.files = async (id) => ({
        data: [files(id)],
        totalCount: 1,
        pageSize: 50,
      });
      CurseForgeClient.prototype.downloadUrl = async () =>
        "https://cdn.modrinth.com/fixture";
      let requests = 0;
      global.fetch = async () => {
        requests++;
        return new Response(payload, {
          headers: { "content-length": String(payload.length) },
        });
      };
      require("../src/main/app/content/ContentService.ts").setupContentIPC();
      const event = { sender: { isDestroyed: () => true } };
      const call = (name, value) => handlers.get(name)(event, value);
      const waitFor = async (id, status) => {
        for (let attempt = 0; attempt < 500; attempt++) {
          const tasks = await call("downloads:list");
          const task = tasks.find((task) => task.id === id);
          if (task?.status === "failed") throw new Error(task.message);
          if (task?.status === status) return task;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`Timed out waiting for ${status}`);
      };
      const createInstance = async () => {
        const id = randomUUID(),
          gamePath = join(root, "Data/minecraft/instances", id);
        await mkdir(gamePath, { recursive: true });
        await writeFile(
          join(gamePath, "instance.json"),
          JSON.stringify({
            id,
            name: "Fixture",
            version: "1.21.1",
            minecraftVersion: "1.21.1",
            loader: "fabric",
            gamePath,
          }),
        );
        return { id, gamePath };
      };
      const firstInstance = await createInstance(),
        secondInstance = await createInstance();
      const first = await call("content:install", {
        projectId: 1,
        fileId: 10,
        instanceId: firstInstance.id,
      });
      const waiting = await waitFor(first.taskId, "waiting");
      assert.equal(waiting.restrictedFiles.length, 2);
      assert.equal(
        requests,
        0,
        "All restricted files must be collected before automatic download starts",
      );
      assert.ok(waiting.directory.startsWith(join(root, "Downloads")));
      const second = await call("content:install", {
        projectId: 4,
        fileId: 40,
        instanceId: secondInstance.id,
      });
      await waitFor(second.taskId, "complete");
      assert.equal(
        await readFile(
          join(secondInstance.gamePath, "mods/fixture-4.jar"),
          "utf8",
        ),
        payload.toString(),
      );
      const paths = [join(root, "first.jar"), join(root, "second.jar")];
      // Equal bytes but distinct pinned metadata are valid for this controlled fixture.
      await Promise.all(paths.map((path) => writeFile(path, payload)));
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: paths,
      });
      const matched = await call("downloads:select-files", first.taskId);
      assert.equal(matched.matched, 2);
      const complete = await waitFor(first.taskId, "complete");
      assert.equal(complete.percent, 100);
      assert.equal(complete.downloadedBytes, payload.length * 3);
      assert.deepEqual(
        (await readdir(join(firstInstance.gamePath, "mods"))).sort(),
        ["fixture-1.jar", "fixture-2.jar", "fixture-3.jar"],
      );
      const custom = join(root, "CustomDownloads");
      await mkdir(custom);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [custom],
      });
      await call("downloads:choose-directory");
      assert.equal((await call("downloads:settings")).directory, custom);
      const { session } = require("electron");
      const {
        RestrictedBrowser,
      } = require("../src/main/app/content/RestrictedBrowser.ts");
      const browserFiles = [2, 3].map((id) => ({
        projectId: id,
        fileId: id * 10,
        projectName: `Fixture ${id}`,
        fileName: `fixture-${id}.jar`,
        version: "1.0",
        received: false,
        url: `https://www.curseforge.com/minecraft/mc-mods/fixture-${id}/download/${id * 10}`,
      }));
      const browserRoot = join(root, "BrowserDownloads");
      for (const file of browserFiles)
        await mkdir(join(browserRoot, String(file.fileId)), {
          recursive: true,
        });
      const browser = new RestrictedBrowser({
        show: false,
        createSession: (partition) => {
          const value = session.fromPartition(partition);
          value.protocol.handle("https", (request) => {
            const url = new URL(request.url);
            if (url.hostname === "www.curseforge.com") {
              const id = Number(url.pathname.split("/").at(-1)) / 10;
              return new Response(
                `<html><body>Isolated official-page fixture<script>setTimeout(() => { location.href = 'https://mediafilez.forgecdn.net/fixture-${id}.jar'; }, 100)</script></body></html>`,
                { headers: { "content-type": "text/html" } },
              );
            }
            return new Response(payload, {
              headers: {
                "content-type": "application/octet-stream",
                "content-length": String(payload.length),
                "content-disposition": `attachment; filename="${url.pathname.slice(1)}"`,
              },
            });
          });
          return value;
        },
      });
      const browserId = "isolated-browser-test";
      const browserErrors = [];
      try {
        await new Promise((resolve, reject) => {
          const received = new Set();
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Batch browser timed out: ${browserErrors.join("; ")}`,
                ),
              ),
            12000,
          );
          browser.open(
            { ...waiting, id: browserId, restrictedFiles: browserFiles },
            browserRoot,
            {
              progress: () => undefined,
              downloaded: async (file, path) => {
                assert.equal(
                  path,
                  join(browserRoot, String(file.fileId), file.fileName),
                );
                assert.equal(
                  (await readFile(path)).toString(),
                  payload.toString(),
                );
                received.add(file.fileId);
                if (received.size === 2) {
                  clearTimeout(timer);
                  resolve();
                }
              },
              failed: (reason) => browserErrors.push(reason),
            },
          );
        });
        const nextFile = {
          ...browserFiles[0],
          projectId: 4,
          fileId: 40,
          projectName: "Fixture 4",
          fileName: "fixture-4.jar",
          url: "https://www.curseforge.com/minecraft/mc-mods/fixture-4/download/40",
          received: false,
        };
        await mkdir(join(browserRoot, "40"));
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Next restricted-file batch timed out")),
            12000,
          );
          browser.open(
            { ...waiting, id: browserId, restrictedFiles: [nextFile] },
            browserRoot,
            {
              progress: () => undefined,
              downloaded: async (file, path) => {
                assert.equal(file.fileId, 40);
                assert.equal(
                  (await readFile(path)).toString(),
                  payload.toString(),
                );
                clearTimeout(timer);
                resolve();
              },
              failed: (reason) => browserErrors.push(reason),
            },
          );
        });
      } finally {
        browser.finish(browserId);
      }
      console.log(
        "PASS: grouped preflight, non-blocking background queue, batched local verification, installation, byte totals, configurable download location, and real Electron batch-browser downloads.",
      );
    })
    .then(() => app.exit(0))
    .catch((error) => {
      console.error(error.message);
      app.exit(1);
    });
}
