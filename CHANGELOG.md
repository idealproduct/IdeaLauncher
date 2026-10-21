# IdeaLauncher Release Notes

## 1.0.1 - 2026-10-22

This release adds an integrated CurseForge content browser and a more reliable
download and installation workflow for Minecraft instances.

### Highlights

- **CurseForge content browser**
  - Search modpacks, mods, shaders, and resource packs from the new Discover
    page.
  - Filter results by Minecraft version and, where applicable, Forge, Fabric,
    or NeoForge.
  - Browse compatible files before installing them.
- **Modpack import**
  - Import CurseForge ZIP files containing `manifest.json`.
  - Import Modrinth MRPACK files containing `modrinth.index.json`.
  - Create a separate instance using the Minecraft and loader versions defined
    by the pack.
- **Background download center**
  - Track queued, checking, downloading, installing, waiting, completed, and
    failed tasks in one place.
  - Continue downloads while switching pages or minimizing the launcher.
  - View download progress by bytes and content files, and open each task's
    folder directly.
- **More robust content installation**
  - Automatically include required CurseForge mod dependencies.
  - Verify downloaded file sizes and hashes before installation.
  - Roll back files when a multi-file installation into an existing instance
    fails.
  - Continue installations that require manually downloaded CurseForge files
    after the required files have been collected and verified.
- **Launcher UI refresh**
  - Updated the navigation, dark theme, account controls, home screen, and
    instance management experience.

### Configuration

CurseForge features require an API key. Configure it with
`scripts/configure-curseforge.cjs`, or provide `CURSEFORGE_API_KEY` or
`IDEALAUNCHER_CURSEFORGE_API_KEY` in the environment. The key is used only by
the Electron main process; the frontend does not expose it.

### Known limitations

- Download tasks are kept in memory and are not restored automatically after
  restarting the launcher.
- Some CurseForge projects restrict third-party downloads. Those files must be
  downloaded from the official CurseForge pages through the launcher's
  built-in download flow.
- Imported and installed content must still be enabled in-game where required.
  Shaders require an instance with Iris, OptiFine, or another compatible
  implementation.
