// Explicit live smoke test: public CurseForge metadata and scratch-directory downloads only.
if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require("electron"), [__filename], {
    windowsHide: true,
    env,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} else {
  const { app, safeStorage } = require("electron");
  const fs = require("node:fs");
  const ts = require("typescript");
  const { join } = require("node:path");
  const {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    rm,
  } = require("node:fs/promises");
  require.extensions[".ts"] = (module, filename) => {
    const { outputText } = ts.transpileModule(
      fs.readFileSync(filename, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: filename,
      },
    );
    module._compile(outputText, filename);
  };
  app.setName("idealauncher");
  void app
    .whenReady()
    .then(async () => {
      const {
        CurseForgeClient,
        CurseForgeKeyStore,
      } = require("../src/main/app/content/CurseForge.ts");
      const {
        fetchCurseFile,
        commitContentFiles,
      } = require("../src/main/app/content/ContentInstaller.ts");
      const {
        inspectPackArchive,
      } = require("../src/main/app/content/PackArchive.ts");
      const keys = new CurseForgeKeyStore(
        join(app.getPath("userData"), "curseforge-key.enc"),
        safeStorage,
      );
      const client = new CurseForgeClient(() => keys.get());
      for (const [kind, query] of [
        ["modpack", "Fabulously Optimized"],
        ["mod", "Sodium"],
        ["shader", "Complementary"],
        ["resourcepack", "Faithful"],
      ]) {
        const results = await client.search({ kind, query });
        if (!results.data.length) throw new Error(`No results for ${kind}`);
        const project =
          results.data.find((project) => project.available) ?? results.data[0];
        const versions = await client.files(project.id);
        if (!versions.data.length) throw new Error(`No versions for ${kind}`);
        const file = versions.data.find(
          (file) => file.fileLength < 30 * 1024 * 1024 && file.isAvailable,
        );
        console.log(
          JSON.stringify({
            kind,
            project: project.name,
            resultCount: results.totalCount,
            versionCount: versions.totalCount,
          }),
        );
        if (file && ["modpack", "resourcepack"].includes(kind)) {
          const data = await fetchCurseFile(client, { project, file });
          if (kind === "modpack") {
            const plan = await inspectPackArchive(data);
            console.log(
              JSON.stringify({
                verifiedPack: plan.name,
                minecraft: plan.minecraftVersion,
                loader: plan.loader,
                loaderVersion: plan.loaderVersion,
                files: plan.fileCount,
              }),
            );
          } else {
            const root = await mkdtemp(
              join(app.getPath("temp"), "idea-live-install-"),
            );
            try {
              const staging = join(root, ".stage");
              await mkdir(staging);
              await writeFile(join(staging, String(file.id)), data);
              await commitContentFiles(root, staging, [{ project, file }]);
              const installed = await readFile(
                join(root, "resourcepacks", file.fileName),
              );
              if (!installed.equals(data))
                throw new Error(
                  "Installed file differs from verified download",
                );
              console.log(
                JSON.stringify({
                  verifiedScratchInstall: file.fileName,
                  bytes: data.length,
                }),
              );
            } finally {
              await rm(root, { recursive: true, force: true });
            }
          }
        }
      }
      app.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      app.exit(1);
    });
}
