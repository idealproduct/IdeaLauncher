// Read the key from stdin, verify it, and persist it using the OS credential encryption.
// No key is printed or stored in the repository.
if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const { readFileSync } = require("node:fs");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const raw = readFileSync(0);
  const input =
    raw[0] === 0xff && raw[1] === 0xfe
      ? raw.toString("utf16le").replace(/^\uFEFF/, "")
      : raw.toString("utf8");
  // Electron GUI processes on Windows do not reliably expose inherited stdin.
  env.IDEALAUNCHER_SETUP_KEY = input.trim();
  const result = spawnSync(require("electron"), [__filename], {
    windowsHide: true,
    env,
    encoding: "utf8",
  });
  delete env.IDEALAUNCHER_SETUP_KEY;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write("Unable to run local key configuration.\n");
    process.exitCode = 1;
  } else process.exitCode = result.status ?? 1;
} else {
  const { app, safeStorage } = require("electron");
  const { mkdir, writeFile } = require("node:fs/promises");
  const { join } = require("node:path");
  app.setName("idealauncher");
  const input = Promise.resolve(process.env.IDEALAUNCHER_SETUP_KEY || "");
  delete process.env.IDEALAUNCHER_SETUP_KEY;
  void Promise.all([app.whenReady(), input])
    .then(async ([, key]) => {
      if (!key || /[\r\n\0]/.test(key) || key.length > 2048)
        throw new Error("Invalid key input");
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("OS credential encryption unavailable");
      await mkdir(app.getPath("userData"), { recursive: true });
      await writeFile(
        join(app.getPath("userData"), "curseforge-key.enc"),
        safeStorage.encryptString(key),
        { mode: 0o600 },
      );
      console.log("CurseForge key encrypted in local application data.");
      const response = await fetch(
        "https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&pageSize=1",
        {
          headers: { "x-api-key": key },
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        throw new Error(
          `CurseForge verification failed: HTTP ${response.status}`,
        );
      console.log("CurseForge connection verified.");
      app.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      app.exit(1);
    });
}
