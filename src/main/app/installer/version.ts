import { app, ipcMain, type WebContents } from "electron";
import { execFile } from "child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import { access } from "fs/promises";
import { dirname, delimiter, join } from "path";
import { createHash, randomUUID } from "crypto";
import { Agent, interceptors } from "undici";
import { launch, Version } from "@xmcl/core";
import {
    getForgeVersionList,
    getLoaderArtifactListFor,
    getVersionList,
    installFabricByLoaderArtifact,
    installForge,
    installNeoForged,
    type MinecraftVersion,
} from "@xmcl/installer";
import { accountManager } from "../auth/manager";

type Loader = "vanilla" | "forge" | "fabric" | "neoforge";

// XMCL 6.1.2 starts every asset download at once. Downloading one verified file
// at a time is deliberately slower, but avoids corrupting files on this system.
const ASSET_DOWNLOAD_CONCURRENCY = 1;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const JAVA_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const JAVA_DOWNLOAD_RETRIES = 3;

// @xmcl/file-transfer passes `maxRedirections` to Undici. Undici 7 requires a
// redirect interceptor to consume that option before it reaches the client.
const loaderDownloadDispatcher = new Agent({ connections: 1, pipelining: 1 })
    .compose(interceptors.redirect({ maxRedirections: 5 }));

interface AssetObject {
    hash: string;
    size: number;
}

interface DownloadInfo {
    url: string;
    sha1: string;
    size: number;
}

interface VersionJson {
    javaVersion?: {
        component?: string;
        majorVersion?: number;
    };
    downloads?: {
        client?: DownloadInfo;
    };
}

interface AssetIndex {
    objects: Record<string, AssetObject>;
}

interface CreateInstancePayload {
    name: string;
    version: string;
    loader: Loader;
    launchAfterInstall?: boolean;
}

interface InstanceRecord {
    id: string;
    name: string;
    minecraftVersion: string;
    version: string;
    loader: Loader;
    gamePath: string;
    minMemory: number;
    maxMemory: number;
    jvmArgs: string[];
    javaMajorVersion: number;
    javaPathOverride?: string;
    gpuAdapter?: string;
    offlineMode: boolean;
    offlineUsername?: string;
}

export interface GpuAdapterSummary {
    id: string;
    name: string;
    vendorId: string;
    deviceId: string;
    subsysId: string;
}

export type InstanceSummary = Pick<
    InstanceRecord,
    "id" | "name" | "minecraftVersion" | "loader" | "minMemory" | "maxMemory" | "jvmArgs" | "javaMajorVersion" | "javaPathOverride" | "gpuAdapter" | "offlineMode" | "offlineUsername"
>;

interface UpdateInstancePayload {
    id: string;
    name: string;
    minMemory: number;
    maxMemory: number;
    jvmArgs: string[];
    javaPathOverride?: string;
    gpuAdapter?: string;
    offlineMode: boolean;
    offlineUsername?: string;
}

function getOfflineUuid(name: string): string {
    const hash = createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOfflineUsername(instance: InstanceRecord): string {
    const configuredUsername = instance.offlineUsername?.trim();
    if (configuredUsername && !/^[A-Za-z0-9_]{3,16}$/.test(configuredUsername)) {
        throw new Error("離線玩家名稱必須是 3-16 個英數字或底線");
    }
    if (configuredUsername) return configuredUsername;

    const fallbackUsername = instance.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
    return fallbackUsername.length >= 3 ? fallbackUsername : "Player";
}

function formatGpuId(value: number | string, width: number): string {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue)
        ? numericValue.toString(16).toUpperCase().padStart(width, "0")
        : String(value).replace(/^0x/i, "").toUpperCase().padStart(width, "0");
}

function normalizeGpuAdapter(value: string): string | undefined {
    const normalized = value
        .trim()
        .replace(/^VEN_/i, "")
        .replace(/&DEV_/i, "&")
        .replace(/&SUBSYS_/i, "&")
        .toUpperCase();
    return /^([0-9A-F]{4})&([0-9A-F]{4})&([0-9A-F]{8})$/.test(normalized) ? normalized : undefined;
}

async function getGpuAdapters(): Promise<GpuAdapterSummary[]> {
    if (process.platform === "win32") {
        try {
            const output = await runCommandWithOutput("powershell.exe", [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object Name,PNPDeviceID | ConvertTo-Json -Compress",
            ]);
            const controllers = JSON.parse(output) as Array<{ Name?: string; PNPDeviceID?: string }> | { Name?: string; PNPDeviceID?: string };
            const list = Array.isArray(controllers) ? controllers : [controllers];
            const adapters = list.flatMap((controller) => {
                const match = controller.PNPDeviceID?.match(/VEN_([0-9A-F]{4})&DEV_([0-9A-F]{4})&SUBSYS_([0-9A-F]{8})/i);
                if (!match) return [];

                const [, vendorId, deviceId, subsysId] = match;
                return [{
                    id: `${vendorId.toUpperCase()}&${deviceId.toUpperCase()}&${subsysId.toUpperCase()}`,
                    name: controller.Name?.trim() || "Unknown GPU",
                    vendorId: vendorId.toUpperCase(),
                    deviceId: deviceId.toUpperCase(),
                    subsysId: subsysId.toUpperCase(),
                }];
            });
            if (adapters.length > 0) return adapters;
        } catch (error) {
            console.warn("Failed to enumerate Windows GPU adapters:", error);
        }
    }

    const gpuInfo = await app.getGPUInfo("complete") as {
        gpuDevice?: Array<{
            vendorId?: number | string;
            deviceId?: number | string;
            subsysId?: number | string;
            subsystemId?: number | string;
            vendorString?: string;
            deviceString?: string;
        }>;
    };
    const devices = Array.isArray(gpuInfo.gpuDevice) ? gpuInfo.gpuDevice : [];
    const adapters = devices.flatMap((device) => {
        const subsystemId = device.subsysId ?? device.subsystemId;
        if (device.vendorId === undefined || device.deviceId === undefined || subsystemId === undefined) {
            return [];
        }

        const vendorId = formatGpuId(device.vendorId, 4);
        const deviceId = formatGpuId(device.deviceId, 4);
        const subsysId = formatGpuId(subsystemId, 8);
        return [{
            id: `${vendorId}&${deviceId}&${subsysId}`,
            name: device.deviceString || device.vendorString || "Unknown GPU",
            vendorId,
            deviceId,
            subsysId,
        }];
    });

    return adapters.filter((adapter, index) => adapters.findIndex((item) => item.id === adapter.id) === index);
}

async function getGpuAdapterName(adapterId?: string): Promise<string> {
    if (!adapterId) return "系統自動選擇";
    try {
        const adapter = (await getGpuAdapters()).find((item) => item.id === adapterId);
        return adapter?.name ?? adapterId;
    } catch {
        return adapterId;
    }
}

async function applyGpuPreference(javaPath: string, gpuAdapter?: string): Promise<void> {
    if (process.platform !== "win32") return;

    const registryPath = "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";
    const javaPaths = [javaPath];
    if (javaPath.toLowerCase().endsWith("\\java.exe")) {
        javaPaths.push(`${javaPath.slice(0, -"java.exe".length)}javaw.exe`);
    }

    if (!gpuAdapter) {
        await Promise.all(javaPaths.map((path) =>
            runCommand("reg.exe", ["delete", registryPath, "/v", path, "/f"]).catch(() => undefined),
        ));
        return;
    }

    const normalizedAdapter = normalizeGpuAdapter(gpuAdapter);
    if (!normalizedAdapter) throw new Error("GPU adapter is invalid");
    const preference = `SpecificAdapter=${normalizedAdapter};GpuPreference=1073741824;`;
    console.log("Applying GPU preference:", { javaPaths, preference });

    await Promise.all(javaPaths.map((path) => runCommand("reg.exe", [
        "add",
        registryPath,
        "/v",
        path,
        "/t",
        "REG_SZ",
        "/d",
        preference,
        "/f",
    ])));
}

function getMinecraftRoot(): string {
    return join(app.getPath("userData"), "minecraft");
}

function getJavaExecutable(directory: string): string {
    return join(directory, "bin", process.platform === "win32" ? "java.exe" : "java");
}

async function getJavaMajorVersion(javaPath: string): Promise<number | undefined> {
    return new Promise((resolve) => {
        execFile(javaPath, ["-version"], { windowsHide: true }, (_error, _stdout, stderr) => {
            const version = stderr.match(/version\s+"(\d+)(?:\.(\d+))?/i);
            if (!version) {
                resolve(undefined);
                return;
            }

            const major = Number(version[1]);
            resolve(major === 1 ? Number(version[2]) : major);
        });
    });
}

function getJavaDownloadTarget(): { os: string; arch: string; extension: string } {
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
    const arch = process.arch === "arm64" ? "aarch64" : process.arch === "ia32" ? "x86-32" : "x64";
    return { os, arch, extension: os === "windows" ? "zip" : "tar.gz" };
}

function runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(command, args, { windowsHide: true }, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function runCommandWithOutput(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(command, args, { windowsHide: true }, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
}

async function findJavaExecutable(directory: string, depth = 0): Promise<string | undefined> {
    if (depth > 4) return undefined;

    try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                const found = await findJavaExecutable(entryPath, depth + 1);
                if (found) return found;
            } else if (entry.name.toLowerCase() === (process.platform === "win32" ? "java.exe" : "java")) {
                const parentDirectory = directory.split(/[\\/]/).pop();
                if (parentDirectory === "bin") return entryPath;
            }
        }
    } catch {
        return undefined;
    }

    return undefined;
}

async function installJavaRuntime(requiredMajorVersion: number): Promise<string> {
    const target = getJavaDownloadTarget();
    const runtimeDirectory = join(getMinecraftRoot(), "java", String(requiredMajorVersion), `${target.os}-${target.arch}`);
    const existingJava = await findJavaExecutable(runtimeDirectory);
    if (existingJava && await getJavaMajorVersion(existingJava) === requiredMajorVersion) return existingJava;

    const archivePath = join(getMinecraftRoot(), "java", `${requiredMajorVersion}-${target.os}-${target.arch}.${target.extension}`);
    const downloadUrl = `https://api.adoptium.net/v3/binary/latest/${requiredMajorVersion}/ga/${target.os}/${target.arch}/jre/hotspot/normal/eclipse`;
    await mkdir(dirname(archivePath), { recursive: true });
    let lastError: unknown;
    for (let attempt = 1; attempt <= JAVA_DOWNLOAD_RETRIES; attempt += 1) {
        try {
            const response = await fetch(downloadUrl, {
                signal: AbortSignal.timeout(JAVA_DOWNLOAD_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`Java runtime download failed with HTTP ${response.status}`);
            }

            await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
            lastError = undefined;
            break;
        } catch (error) {
            lastError = error;
            await rm(archivePath, { force: true });
            if (attempt < JAVA_DOWNLOAD_RETRIES) {
                await new Promise<void>((resolve) => setTimeout(resolve, 2000 * attempt));
            }
        }
    }
    if (lastError) {
        throw new Error(`無法下載 Java ${requiredMajorVersion} runtime，已重試 ${JAVA_DOWNLOAD_RETRIES} 次`, { cause: lastError });
    }

    await rm(runtimeDirectory, { recursive: true, force: true });
    await mkdir(runtimeDirectory, { recursive: true });

    try {
        await runCommand("tar", ["-xf", archivePath, "-C", runtimeDirectory]);
    } finally {
        await rm(archivePath, { force: true });
    }

    const installedJava = await findJavaExecutable(runtimeDirectory);
    if (!installedJava || await getJavaMajorVersion(installedJava) !== requiredMajorVersion) {
        throw new Error(`Java ${requiredMajorVersion} runtime 安裝後無法驗證`);
    }

    return installedJava;
}

async function findJavaPath(requiredMajorVersion: number, onLog?: (message: string) => void): Promise<string> {
    const candidates = new Set<string>();
    if (process.env.JAVA_HOME) candidates.add(getJavaExecutable(process.env.JAVA_HOME));

    for (const directory of (process.env.PATH ?? "").split(delimiter)) {
        candidates.add(join(directory, process.platform === "win32" ? "java.exe" : "java"));
    }

    if (process.platform === "win32") {
        for (const root of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
            if (!root) continue;
            for (const folder of ["Java", "Eclipse Adoptium", "Microsoft", "Temurin"]) {
                try {
                    const entries = await readdir(join(root, folder), { withFileTypes: true });
                    entries.filter((entry) => entry.isDirectory()).forEach((entry) => {
                        candidates.add(getJavaExecutable(join(root, folder, entry.name)));
                    });
                } catch {
                    // The optional Java installation directory may not exist.
                }
            }
        }
    }

    for (const candidate of candidates) {
        try {
            await access(candidate);
            if (await getJavaMajorVersion(candidate) === requiredMajorVersion) return candidate;
        } catch {
            // Try the next Java candidate.
        }
    }

    onLog?.(`找不到 Java ${requiredMajorVersion}，開始下載 Java runtime`);
    const javaPath = await installJavaRuntime(requiredMajorVersion);
    onLog?.(`Java ${requiredMajorVersion} runtime 安裝完成`);
    return javaPath;
}

async function resolveJavaPath(instance: InstanceRecord): Promise<string> {
    if (instance.javaPathOverride?.trim()) {
        try {
            await access(instance.javaPathOverride);
        } catch {
            throw new Error(`Java 路徑不存在：${instance.javaPathOverride}`);
        }
        const majorVersion = await getJavaMajorVersion(instance.javaPathOverride);
        if (majorVersion !== instance.javaMajorVersion) {
            throw new Error(`Java 路徑版本不符，需要 Java ${instance.javaMajorVersion}`);
        }
        return instance.javaPathOverride;
    }

    return findJavaPath(instance.javaMajorVersion);
}

function getInstancePath(instanceId: string): string {
    if (!/^[a-f0-9-]+$/i.test(instanceId)) {
        throw new Error("Invalid instance id");
    }

    return join(getMinecraftRoot(), "instances", instanceId);
}

async function readInstance(instanceId: string): Promise<InstanceRecord> {
    const instancePath = getInstancePath(instanceId);
    const instance = JSON.parse(await readFile(join(instancePath, "instance.json"), "utf8")) as Partial<InstanceRecord>;

    if (instance.id !== instanceId || !instance.gamePath || !instance.version || !instance.name) {
        throw new Error("Instance configuration is invalid");
    }

    return {
        ...instance,
        minMemory: instance.minMemory ?? 1024,
        maxMemory: instance.maxMemory ?? 4096,
        jvmArgs: instance.jvmArgs ?? [],
        javaMajorVersion: instance.javaMajorVersion ?? 8,
        javaPathOverride: instance.javaPathOverride,
        gpuAdapter: instance.gpuAdapter ? normalizeGpuAdapter(instance.gpuAdapter) : undefined,
        offlineMode: instance.offlineMode ?? false,
        offlineUsername: instance.offlineUsername,
    } as InstanceRecord;
}

function sendProgress(sender: WebContents, percent: number): void {
    sender.send("install-progress", percent);
}

function sendInstanceLog(sender: WebContents, instanceId: string, instanceName: string, message: string): void {
    sender.send("instance-log", {
        instanceId,
        instanceName,
        timestamp: new Date().toISOString(),
        message,
    });
}

function normalizeMinecraftLogOutput(output: string): string {
    return output
        .replace(/<\/?log4j:[^>]+>/g, "")
        .replace(/<!\[CDATA\[/g, "")
        .replace(/\]\]>/g, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
}

function forwardProcessLogs(sender: WebContents, process: ReturnType<typeof launch>, instanceId: string, instanceName: string): void {
    void process.then((child) => {
        child.stdout?.on("data", (data: Buffer | string) => {
            const output = normalizeMinecraftLogOutput(String(data));
            if (output) sendInstanceLog(sender, instanceId, instanceName, output);
        });
        child.stderr?.on("data", (data: Buffer | string) => {
            const output = normalizeMinecraftLogOutput(String(data));
            if (output) sendInstanceLog(sender, instanceId, instanceName, output);
        });
        child.on("error", (error) => {
            sendInstanceLog(sender, instanceId, instanceName, `啟動程序錯誤：${error.message}`);
        });
        child.on("close", (code) => {
            sendInstanceLog(sender, instanceId, instanceName, `Minecraft 程序已結束，退出碼：${code ?? "unknown"}`);
        });
        child.unref();
    });
}

async function getLatestNeoForgeVersion(minecraftVersion: string): Promise<string> {
    const response = await fetch(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"
    );

    if (!response.ok) {
        throw new Error("Unable to fetch NeoForge versions");
    }

    const versionPrefix = `${minecraftVersion.replace(/^1\./, "")}.`;
    const versions = [...(await response.text()).matchAll(/<version>([^<]+)<\/version>/g)]
        .map((match) => match[1])
        .filter((version) => version.startsWith(versionPrefix))
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

    if (versions.length === 0) {
        throw new Error(`NeoForge does not support Minecraft ${minecraftVersion}`);
    }

    return versions[0];
}

async function downloadVerifiedFile(
    url: string,
    destination: string,
    expectedHash: string | undefined,
    expectedSize?: number,
    onLog?: (message: string) => void,
): Promise<void> {
    const verifiedSize = expectedSize !== undefined && expectedSize >= 0 ? expectedSize : undefined;

    try {
        const existingContent = await readFile(destination);
        const existingHash = createHash("sha1").update(existingContent).digest("hex");
        if (
            (!expectedHash || existingHash === expectedHash)
            && (verifiedSize === undefined || existingContent.length === verifiedSize)
        ) {
            onLog?.(`檔案已存在，跳過下載：${destination}`);
            return;
        }
    } catch {
        // The file does not exist yet, or cannot be read. Download it below.
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            onLog?.(`開始下載檔案（第 ${attempt + 1}/3 次）：${destination}`);
            const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
            if (!response.ok) {
                throw new Error(`Asset request failed with HTTP ${response.status}`);
            }

            const content = Buffer.from(await response.arrayBuffer());
            const actualHash = createHash("sha1").update(content).digest("hex");
            const hashMatches = !expectedHash || actualHash === expectedHash;
            const sizeMatches = verifiedSize === undefined || content.length === verifiedSize;
            if (!hashMatches || !sizeMatches) {
                throw new Error(
                    `Checksum or size mismatch for ${url} (attempt ${attempt + 1}; `
                    + `expected sha1=${expectedHash ?? "not provided"}, actual sha1=${actualHash}, `
                    + `expected size=${verifiedSize ?? "not provided"}, actual size=${content.length})`,
                );
            }

            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, content);
            onLog?.(`檔案下載完成：${destination}`);
            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            onLog?.(`檔案下載失敗：${destination}，原因：${lastError.message}`);
        }
    }

    throw lastError ?? new Error(`Unable to download ${url}`);
}

async function downloadVersionJson(url: string, destination: string, onLog?: (message: string) => void): Promise<VersionJson> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            onLog?.(`開始下載版本 metadata（第 ${attempt + 1}/3 次）：${destination}`);
            const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
            if (!response.ok) {
                throw new Error(`Version metadata request failed with HTTP ${response.status}`);
            }
            const content = await response.text();
            const versionJson = JSON.parse(content) as VersionJson;
            if (!versionJson.downloads?.client) {
                throw new Error("Version metadata does not contain a client download");
            }
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, content, "utf8");
            onLog?.(`版本 metadata 下載完成：${destination}`);
            return versionJson;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            onLog?.(`版本 metadata 下載失敗：${destination}，原因：${lastError.message}`);
        }
    }

    throw lastError ?? new Error(`Unable to download ${url}`);
}

async function installVanillaVersion(
    version: MinecraftVersion,
    minecraftRoot: string,
    onLog?: (message: string) => void,
): Promise<VersionJson> {
    const versionDirectory = join(minecraftRoot, "versions", version.id);
    const versionJson = await downloadVersionJson(version.url, join(versionDirectory, `${version.id}.json`), onLog);
    const client = versionJson.downloads?.client;

    if (!client) {
        throw new Error(`Minecraft ${version.id} does not provide a client download`);
    }

    await downloadVerifiedFile(client.url, join(versionDirectory, `${version.id}.jar`), client.sha1, client.size, onLog);
    return versionJson;
}

async function installLibrariesSequentially(
    version: Awaited<ReturnType<typeof Version.parse>>,
    onProgress?: (completed: number, total: number, library: string) => void,
    onLog?: (message: string) => void,
): Promise<void> {
    let completed = 0;
    for (const library of version.libraries) {
        await downloadVerifiedFile(
            library.download.url,
            join(version.minecraftDirectory, "libraries", library.download.path),
            library.download.sha1,
            library.download.size,
            onLog,
        );
        completed += 1;
        onProgress?.(completed, version.libraries.length, library.name);
    }
}

async function installAssetsInBatches(
    version: Awaited<ReturnType<typeof Version.parse>>,
    minecraftRoot: string,
    onProgress?: (completed: number, total: number) => void,
    onLog?: (message: string) => void,
): Promise<void> {
    if (!version.assetIndex) {
        throw new Error(`Minecraft ${version.id} does not provide an asset index`);
    }

    const assetIndexPath = join(minecraftRoot, "assets", "indexes", `${version.assetIndex.id}.json`);
    await downloadVerifiedFile(version.assetIndex.url, assetIndexPath, version.assetIndex.sha1, undefined, onLog);
    const assetIndex = JSON.parse(await readFile(assetIndexPath, "utf8")) as AssetIndex;
    const assets = Object.values(assetIndex.objects);

    let completed = 0;
    for (let start = 0; start < assets.length; start += ASSET_DOWNLOAD_CONCURRENCY) {
        for (const asset of assets.slice(start, start + ASSET_DOWNLOAD_CONCURRENCY)) {
            const head = asset.hash.slice(0, 2);
            await downloadVerifiedFile(
                `https://resources.download.minecraft.net/${head}/${asset.hash}`,
                join(minecraftRoot, "assets", "objects", head, asset.hash),
                asset.hash,
                asset.size,
                onLog,
            );
            completed += 1;
            if (completed % 20 === 0 || completed === assets.length) {
                onProgress?.(completed, assets.length);
            }
        }
    }
}

async function installLoader(
    loader: Exclude<Loader, "vanilla">,
    minecraftVersion: string,
    minecraftRoot: string,
    javaPath: string,
): Promise<string> {
    if (loader === "forge") {
        const forgeVersions = (await getForgeVersionList({
            minecraft: minecraftVersion,
            dispatcher: loaderDownloadDispatcher,
        })).versions;
        const forge = forgeVersions.find((version) => version.type === "recommended")
            ?? forgeVersions.find((version) => version.type === "latest")
            ?? forgeVersions[0];

        if (!forge) {
            throw new Error(`Forge does not support Minecraft ${minecraftVersion}`);
        }

        return installForge(forge, minecraftRoot, {
            java: javaPath,
            dispatcher: loaderDownloadDispatcher,
        });
    }

    if (loader === "fabric") {
        const artifacts = await getLoaderArtifactListFor(minecraftVersion);
        const artifact = artifacts.find((item) => item.loader.stable) ?? artifacts[0];

        if (!artifact) {
            throw new Error(`Fabric does not support Minecraft ${minecraftVersion}`);
        }

        return installFabricByLoaderArtifact(artifact, minecraftRoot);
    }

    return installNeoForged(
        "neoforge",
        await getLatestNeoForgeVersion(minecraftVersion),
        minecraftRoot,
        { java: javaPath, dispatcher: loaderDownloadDispatcher },
    );
}

export function setupVersionIPC(): void {
    ipcMain.handle("get-instances", async (): Promise<InstanceSummary[]> => {
        const instancesDirectory = join(getMinecraftRoot(), "instances");

        try {
            const instanceDirectories = await readdir(instancesDirectory, { withFileTypes: true });
            const instances = await Promise.all(
                instanceDirectories
                    .filter((entry) => entry.isDirectory())
                    .map(async (entry) => {
                        try {
                            const content = await readFile(join(instancesDirectory, entry.name, "instance.json"), "utf8");
                            const instance = JSON.parse(content) as InstanceRecord;
                            return {
                                id: instance.id,
                                name: instance.name,
                                minecraftVersion: instance.minecraftVersion,
                                loader: instance.loader,
                                minMemory: instance.minMemory ?? 1024,
                                maxMemory: instance.maxMemory ?? 4096,
                                jvmArgs: instance.jvmArgs ?? [],
                                javaMajorVersion: instance.javaMajorVersion ?? 8,
                                javaPathOverride: instance.javaPathOverride,
                                gpuAdapter: instance.gpuAdapter ? normalizeGpuAdapter(instance.gpuAdapter) : undefined,
                                offlineMode: instance.offlineMode ?? false,
                                offlineUsername: instance.offlineUsername,
                            } satisfies InstanceSummary;
                        } catch {
                            return null;
                        }
                    }),
            );

            return instances
                .filter((instance): instance is NonNullable<typeof instance> => instance !== null)
                .sort((left, right) => left.name.localeCompare(right.name));
        } catch {
            return [];
        }
    });

    ipcMain.handle("update-instance", async (_event, payload: UpdateInstancePayload): Promise<InstanceSummary> => {
        if (!payload?.name?.trim()) {
            throw new Error("Instance name is required");
        }
        if (!Number.isInteger(payload.minMemory) || !Number.isInteger(payload.maxMemory)
            || payload.minMemory < 256 || payload.maxMemory < payload.minMemory || payload.maxMemory > 65536) {
            throw new Error("Memory must be between 256 MB and 65536 MB, with max memory greater than min memory");
        }
        if (!Array.isArray(payload.jvmArgs) || payload.jvmArgs.some((arg) => typeof arg !== "string")) {
            throw new Error("JVM arguments are invalid");
        }
        if (payload.gpuAdapter !== undefined && !normalizeGpuAdapter(payload.gpuAdapter)) {
            throw new Error("GPU adapter is invalid");
        }

        const instance = await readInstance(payload.id);
        const updatedInstance: InstanceRecord = {
            ...instance,
            name: payload.name.trim(),
            minMemory: payload.minMemory,
            maxMemory: payload.maxMemory,
            jvmArgs: payload.jvmArgs.map((arg) => arg.trim()).filter(Boolean),
            javaPathOverride: payload.javaPathOverride?.trim() || undefined,
            gpuAdapter: payload.gpuAdapter ? normalizeGpuAdapter(payload.gpuAdapter) : undefined,
            offlineMode: payload.offlineMode,
            offlineUsername: payload.offlineUsername?.trim() || undefined,
        };
        if (updatedInstance.offlineUsername && !/^[A-Za-z0-9_]{3,16}$/.test(updatedInstance.offlineUsername)) {
            throw new Error("離線玩家名稱必須是 3-16 個英數字或底線");
        }
        await writeFile(join(getInstancePath(payload.id), "instance.json"), JSON.stringify(updatedInstance, null, 2), "utf8");

        return {
            id: updatedInstance.id,
            name: updatedInstance.name,
            minecraftVersion: updatedInstance.minecraftVersion,
            loader: updatedInstance.loader,
            minMemory: updatedInstance.minMemory,
            maxMemory: updatedInstance.maxMemory,
            jvmArgs: updatedInstance.jvmArgs,
            javaMajorVersion: updatedInstance.javaMajorVersion,
            javaPathOverride: updatedInstance.javaPathOverride,
            gpuAdapter: updatedInstance.gpuAdapter,
            offlineMode: updatedInstance.offlineMode,
            offlineUsername: updatedInstance.offlineUsername,
        };
    });

    ipcMain.handle("get-gpus", async (): Promise<GpuAdapterSummary[]> => getGpuAdapters());

    ipcMain.handle("launch-instance", async (event, instanceId: string): Promise<{ success: true }> => {
        const instance = await readInstance(instanceId);
        sendInstanceLog(event.sender, instance.id, instance.name, `準備啟動 Instance：${instance.name}`);
        const javaPath = await resolveJavaPath(instance);
        sendInstanceLog(event.sender, instance.id, instance.name, `使用 Java：${javaPath}`);
        const account = accountManager.getSelectedAccount();
        if (!instance.offlineMode && !account?.id) {
            throw new Error("Please sign in with a Minecraft account before launching");
        }

        await applyGpuPreference(javaPath, instance.gpuAdapter);
        sendInstanceLog(event.sender, instance.id, instance.name, `GPU 設定：${await getGpuAdapterName(instance.gpuAdapter)}`);

        const process = launch({
            gamePath: instance.gamePath,
            resourcePath: getMinecraftRoot(),
            javaPath,
            version: instance.version,
            gameProfile: {
                id: account?.id ?? getOfflineUuid(getOfflineUsername(instance)),
                name: account?.username ?? getOfflineUsername(instance),
            },
            accessToken: account?.minecraftAccessToken ?? "0",
            userType: instance.offlineMode ? "legacy" : "mojang",
            launcherName: "IdeaLauncher",
            launcherBrand: "IdeaLauncher",
            minMemory: instance.minMemory,
            maxMemory: instance.maxMemory,
            extraJVMArgs: instance.jvmArgs,
            extraExecOption: { detached: true },
        });
        forwardProcessLogs(event.sender, process, instance.id, instance.name);
        await process;
        sendInstanceLog(event.sender, instance.id, instance.name, "Minecraft 啟動程序已建立");

        return { success: true };
    });

    ipcMain.handle("delete-instance", async (_event, payload: { instanceId: string; deleteFiles?: boolean }): Promise<{ success: true }> => {
        const instanceId = payload?.instanceId;
        const instance = await readInstance(instanceId);
        if (payload.deleteFiles === true) {
            await rm(getInstancePath(instance.id), { recursive: true, force: true });
        }
        return { success: true };
    });

    ipcMain.handle('get-minecraft-versions', async () => {
        try {
            const response = await getVersionList();
            const list: MinecraftVersion[] = response.versions;
            return { success: true, data: list };
        } catch (error) {
            console.error('Failed to fetch versions:', error);
            return { success: false, data: [], error: error instanceof Error ? error.message : String(error) };
        }
    });

    ipcMain.handle("create-instance", async (event, payload: CreateInstancePayload) => {
        if (!payload?.name?.trim() || !payload.version) {
            throw new Error("Instance name and Minecraft version are required");
        }

        const loader: Loader = payload.loader ?? "vanilla";
        if (!["vanilla", "forge", "fabric", "neoforge"].includes(loader)) {
            throw new Error("Unsupported mod loader");
        }

        const versionList = await getVersionList();
        const minecraftVersion = versionList.versions.find((version) => version.id === payload.version);
        if (!minecraftVersion) {
            throw new Error("The selected Minecraft version no longer exists");
        }
        if (loader !== "vanilla" && minecraftVersion.type !== "release") {
            throw new Error("Forge, Fabric, and NeoForge can only be installed on release versions");
        }

        const minecraftRoot = getMinecraftRoot();
        const instanceId = randomUUID();
        const instance: InstanceRecord = {
            id: instanceId,
            name: payload.name.trim(),
            minecraftVersion: minecraftVersion.id,
            version: minecraftVersion.id,
            loader,
            gamePath: join(minecraftRoot, "instances", instanceId),
            minMemory: 1024,
            maxMemory: 4096,
            jvmArgs: [],
            javaMajorVersion: 8,
            offlineMode: false,
        };
        sendInstanceLog(event.sender, instance.id, instance.name, `開始安裝 Instance：${instance.name} (${minecraftVersion.id})`);

        await mkdir(instance.gamePath, { recursive: true });
        sendInstanceLog(event.sender, instance.id, instance.name, "Instance 資料夾已建立");
        sendProgress(event.sender, 5);
        const downloadLog = (message: string): void => {
            sendInstanceLog(event.sender, instance.id, instance.name, message);
        };
        const versionJson = await installVanillaVersion(minecraftVersion, minecraftRoot, downloadLog);
        sendInstanceLog(event.sender, instance.id, instance.name, "Minecraft Vanilla 檔案安裝完成");
        instance.javaMajorVersion = versionJson.javaVersion?.majorVersion ?? 8;
        const javaPath = await findJavaPath(instance.javaMajorVersion, (message) => {
            sendInstanceLog(event.sender, instance.id, instance.name, message);
        });
        const vanillaVersion = await Version.parse(minecraftRoot, minecraftVersion.id);
        sendInstanceLog(event.sender, instance.id, instance.name, `開始下載 libraries：${vanillaVersion.libraries.length} 個檔案`);
        await installLibrariesSequentially(vanillaVersion, (completed, total, library) => {
            if (completed === total || completed % 10 === 0) {
                sendInstanceLog(event.sender, instance.id, instance.name, `libraries 進度：${completed}/${total}（${library}）`);
            }
        }, downloadLog);
        sendInstanceLog(event.sender, instance.id, instance.name, "libraries 下載完成");
        sendInstanceLog(event.sender, instance.id, instance.name, `開始下載 assets：${vanillaVersion.assetIndex?.totalSize ?? 0} bytes`);
        await installAssetsInBatches(vanillaVersion, minecraftRoot, (completed, total) => {
            sendProgress(event.sender, 10 + Math.round((completed / total) * 55));
            if (completed === total || completed % 100 === 0) {
                sendInstanceLog(event.sender, instance.id, instance.name, `assets 進度：${completed}/${total}`);
            }
        }, downloadLog);
        sendInstanceLog(event.sender, instance.id, instance.name, "assets 下載完成");
        sendProgress(event.sender, 65);

        if (loader !== "vanilla") {
            sendInstanceLog(event.sender, instance.id, instance.name, `開始安裝 Mod Loader：${loader}`);
            instance.version = await installLoader(loader, minecraftVersion.id, minecraftRoot, javaPath);
            const resolvedVersion = await Version.parse(minecraftRoot, instance.version);
            await installLibrariesSequentially(resolvedVersion, (completed, total, library) => {
                if (completed === total || completed % 10 === 0) {
                    sendInstanceLog(event.sender, instance.id, instance.name, `Mod Loader libraries：${completed}/${total}（${library}）`);
                }
            }, downloadLog);
            sendInstanceLog(event.sender, instance.id, instance.name, "Mod Loader 安裝完成");
        }

        sendProgress(event.sender, 95);
        await writeFile(
            join(instance.gamePath, "instance.json"),
            JSON.stringify(instance, null, 2),
            "utf8",
        );
        sendInstanceLog(event.sender, instance.id, instance.name, "Instance 設定已寫入");

        if (payload.launchAfterInstall) {
            const account = accountManager.getSelectedAccount();
            if (!instance.offlineMode && !account?.id) {
                throw new Error("Please sign in with a Minecraft account before launching");
            }

            await applyGpuPreference(javaPath, instance.gpuAdapter);

            const process = launch({
                gamePath: instance.gamePath,
                resourcePath: minecraftRoot,
                javaPath,
                version: instance.version,
                gameProfile: {
                    id: account?.id ?? getOfflineUuid(getOfflineUsername(instance)),
                    name: account?.username ?? getOfflineUsername(instance),
                },
                accessToken: account?.minecraftAccessToken ?? "0",
                userType: instance.offlineMode ? "legacy" : "mojang",
                launcherName: "IdeaLauncher",
                launcherBrand: "IdeaLauncher",
                minMemory: instance.minMemory,
                maxMemory: instance.maxMemory,
                extraJVMArgs: instance.jvmArgs,
                extraExecOption: { detached: true },
            });
            forwardProcessLogs(event.sender, process, instance.id, instance.name);
            await process;
            sendInstanceLog(event.sender, instance.id, instance.name, "Minecraft 啟動程序已建立");
        }

        sendProgress(event.sender, 100);
        return { success: true, instance };
    });
}
