import { createHash } from "crypto";
import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { dirname } from "path";
import {
  classIds,
  contentKinds,
  loaderIds,
  positiveId,
  type ContentProject,
  type ContentFile,
  type ContentSearch,
  type ContentPage,
} from "../../../shared/content";

interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class CurseForgeKeyStore {
  constructor(
    private readonly path: string,
    private readonly encryption: SecretStorage,
  ) {}
  async get(): Promise<string> {
    const environmentKey =
      process.env.IDEALAUNCHER_CURSEFORGE_API_KEY ||
      process.env.CURSEFORGE_API_KEY;
    if (environmentKey) return environmentKey.trim();
    try {
      return this.encryption.decryptString(await readFile(this.path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw new Error("無法解密 CurseForge 金鑰，請重新設定");
    }
  }
  async save(key: string): Promise<void> {
    if (typeof key !== "string" || /[\r\n\0]/.test(key) || key.length > 2048)
      throw new Error("API Key 格式不正確");
    if (!key.trim()) {
      await unlink(this.path).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return;
    }
    if (!this.encryption.isEncryptionAvailable())
      throw new Error(
        "此系統無法安全儲存 API Key，請使用 CURSEFORGE_API_KEY 環境變數",
      );
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, this.encryption.encryptString(key.trim()), {
      mode: 0o600,
    });
  }
}

export class CurseForgeClient {
  constructor(
    private readonly getKey: () => Promise<string>,
    private readonly request: typeof fetch = fetch,
  ) {}

  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<{
    data: T;
    pagination?: { index: number; totalCount: number; pageSize: number };
  }> {
    const key = await this.getKey();
    if (!key) throw new Error("CurseForge 連線尚未設定（缺少主程序 API Key）");
    const url = new URL(`https://api.curseforge.com/v1/${path}`);
    for (const [name, value] of Object.entries(query))
      if (value !== undefined && value !== "")
        url.searchParams.set(name, String(value));
    let response: Response;
    try {
      response = await this.request(url, {
        headers: { "x-api-key": key, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("無法連線至 CurseForge，請檢查網路後重試");
    }
    if (!response.ok) {
      if ([401, 403].includes(response.status))
        throw new Error("CurseForge API Key 無效或未獲存取權限");
      if (response.status === 429)
        throw new Error("CurseForge 請求過於頻繁，請稍後重試");
      throw new Error(`CurseForge 請求失敗（HTTP ${response.status}）`);
    }
    return response.json();
  }

  async search(input: ContentSearch): Promise<ContentPage<ContentProject>> {
    if (
      !input ||
      !contentKinds.includes(input.kind) ||
      typeof input.query !== "string" ||
      input.query.length > 200
    )
      throw new Error("搜尋條件不正確");
    const index = input.index ?? 0;
    if (!Number.isInteger(index) || index < 0 || index > 9980)
      throw new Error("搜尋頁碼不正確");
    if (input.loader && !(input.loader in loaderIds))
      throw new Error("載入器不正確");
    const result = await this.get<RawProject[]>("mods/search", {
      gameId: 432,
      classId: classIds[input.kind],
      searchFilter: input.query.trim(),
      gameVersion: input.gameVersion,
      modLoaderType:
        input.gameVersion && input.kind === "mod" && input.loader
          ? loaderIds[input.loader]
          : undefined,
      sortField: 2,
      sortOrder: "desc",
      index,
      pageSize: 20,
    });
    return {
      data: result.data.map((project) => this.projectSummary(project)),
      index,
      totalCount: result.pagination?.totalCount ?? result.data.length,
      pageSize: 20,
    };
  }

  private projectSummary(project: RawProject): ContentProject {
    const kind = contentKinds.find(
      (kind) => classIds[kind] === project.classId,
    );
    if (project.gameId !== 432 || !kind)
      throw new Error("此專案不是支援的 Minecraft 內容");
    return {
      id: project.id,
      name: project.name,
      summary: project.summary,
      kind,
      authors: project.authors.map((author) => author.name),
      icon: project.logo?.thumbnailUrl,
      websiteUrl: project.links.websiteUrl,
      downloads: project.downloadCount,
      available: project.allowModDistribution !== false,
    };
  }

  async project(id: number): Promise<ContentProject> {
    return this.projectSummary(
      (await this.get<RawProject>(`mods/${positiveId(id)}`)).data,
    );
  }
  async files(
    projectId: number,
    index = 0,
    gameVersion?: string,
    loader?: keyof typeof loaderIds,
  ): Promise<ContentPage<ContentFile>> {
    positiveId(projectId);
    if (!Number.isInteger(index) || index < 0 || index > 9950)
      throw new Error("版本頁碼不正確");
    const result = await this.get<ContentFile[]>(`mods/${projectId}/files`, {
      index,
      pageSize: 50,
      gameVersion,
      modLoaderType: loader ? loaderIds[loader] : undefined,
    });
    return {
      data: result.data.filter((file) => file.isAvailable),
      index,
      totalCount: result.pagination?.totalCount ?? result.data.length,
      pageSize: 50,
    };
  }
  async file(projectId: number, fileId: number): Promise<ContentFile> {
    const file = (
      await this.get<ContentFile>(
        `mods/${positiveId(projectId)}/files/${positiveId(fileId)}`,
      )
    ).data;
    if (file.modId !== projectId || !file.isAvailable)
      throw new Error("此檔案已無法下載");
    return file;
  }
  async downloadUrl(
    project: ContentProject,
    file: ContentFile,
  ): Promise<string> {
    if (!project.available)
      throw new Error(
        `「${project.name}」作者未允許第三方下載，請至 CurseForge 專案頁下載後匯入`,
      );
    const url =
      file.downloadUrl ||
      (
        await this.get<string>(
          `mods/${project.id}/files/${file.id}/download-url`,
        )
      ).data;
    if (!url) throw new Error(`「${project.name}」目前沒有可用的下載連結`);
    return url;
  }
}

interface RawProject {
  id: number;
  gameId: number;
  classId: number;
  name: string;
  summary: string;
  authors: { name: string }[];
  logo?: { thumbnailUrl: string };
  links: { websiteUrl: string };
  downloadCount: number;
  allowModDistribution?: boolean;
}

export function validateDownloadUrl(value: string): URL {
  const url = new URL(value);
  const hosts = [
    "cdn.modrinth.com",
    "github.com",
    "gitlab.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !(hosts.includes(url.hostname) || url.hostname.endsWith(".forgecdn.net"))
  )
    throw new Error("模組包包含不支援的下載來源");
  return url;
}

export async function downloadContent(
  url: string,
  hashes: { algorithm: "sha1" | "sha512" | "md5"; value: string }[],
  maxSize = 512 * 1024 * 1024,
  request: typeof fetch = fetch,
  onProgress?: (received: number, total?: number) => void,
): Promise<Buffer> {
  let current = validateDownloadUrl(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await request(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      current = validateDownloadUrl(
        new URL(response.headers.get("location") || "", current).href,
      );
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error(`下載失敗（HTTP ${response.status}）`);
    const chunks: Buffer[] = [];
    let size = 0;
    const expected =
      Number(response.headers.get("content-length")) || undefined;
    onProgress?.(0, expected);
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxSize) {
        await response.body.cancel().catch(() => undefined);
        throw new Error("下載檔案超過大小限制");
      }
      chunks.push(Buffer.from(chunk));
      onProgress?.(size, expected);
    }
    const data = Buffer.concat(chunks);
    if (!data.length) throw new Error("下載檔案為空");
    for (const hash of hashes) {
      if (
        createHash(hash.algorithm).update(data).digest("hex").toLowerCase() !==
        hash.value.toLowerCase()
      )
        throw new Error("下載檔案雜湊驗證失敗，請重試");
    }
    return data;
  }
  throw new Error("下載重新導向過多");
}
