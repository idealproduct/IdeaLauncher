import type { InstanceSummary } from "./launcher";

export type ContentKind = "modpack" | "mod" | "shader" | "resourcepack";
export const contentKinds: ContentKind[] = [
  "modpack",
  "mod",
  "shader",
  "resourcepack",
];
export const contentLabels: Record<ContentKind, string> = {
  modpack: "模組包",
  mod: "模組",
  shader: "光影",
  resourcepack: "材質包",
};
export const classIds: Record<ContentKind, number> = {
  modpack: 4471,
  mod: 6,
  shader: 6552,
  resourcepack: 12,
};
export const loaderIds = { vanilla: 0, forge: 1, fabric: 4, neoforge: 6 };
export const loaderTags = [
  "Forge",
  "Fabric",
  "NeoForge",
  "Quilt",
  "LiteLoader",
  "Rift",
];

export interface ContentProject {
  id: number;
  name: string;
  summary: string;
  kind: ContentKind;
  authors: string[];
  icon?: string;
  websiteUrl: string;
  downloads: number;
  available: boolean;
}
export interface ContentFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  gameVersions: string[];
  releaseType: number;
  fileDate: string;
  fileLength: number;
  isAvailable: boolean;
  downloadUrl?: string | null;
  hashes: { algo: number; value: string }[];
  dependencies: { modId: number; relationType: number }[];
}
export interface ContentSearch {
  query: string;
  kind: ContentKind;
  gameVersion?: string;
  loader?: InstanceSummary["loader"];
  index?: number;
}
export interface ContentPage<T> {
  data: T[];
  index: number;
  totalCount: number;
  pageSize: number;
}
export interface ContentProgress {
  taskId: string;
  phase: "installing" | "complete" | "failed";
  message: string;
  percent?: number;
}
export type DownloadStatus =
  | "queued"
  | "preparing"
  | "downloading"
  | "installing"
  | "waiting"
  | "complete"
  | "failed";
export interface RestrictedDownload {
  projectId: number;
  fileId: number;
  projectName: string;
  fileName: string;
  version: string;
  url: string;
  received: boolean;
}
export interface DownloadTask {
  id: string;
  name: string;
  kind: ContentKind;
  status: DownloadStatus;
  message: string;
  percent: number;
  completedFiles: number;
  totalFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  currentFile?: string;
  createdAt: number;
  updatedAt: number;
  instanceId?: string;
  directory?: string;
  restrictedFiles: RestrictedDownload[];
}
export function isDownloadActive(task: DownloadTask): boolean {
  return !["complete", "failed"].includes(task.status);
}
export interface PackPreview {
  token: string;
  name: string;
  format: "curseforge" | "modrinth";
  minecraftVersion: string;
  loader: InstanceSummary["loader"];
  loaderVersion?: string;
  fileCount: number;
  needsApiKey: boolean;
}

export function isFileCompatible(
  file: ContentFile,
  instance: Pick<InstanceSummary, "minecraftVersion" | "loader">,
  kind: ContentKind,
): boolean {
  if (
    !file.isAvailable ||
    !file.gameVersions.includes(instance.minecraftVersion)
  )
    return false;
  if (kind !== "mod") return kind !== "modpack";
  const tags = file.gameVersions.map((version) => version.toLowerCase());
  return instance.loader !== "vanilla" && tags.includes(instance.loader);
}

export function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("專案或檔案 ID 不正確");
  return value;
}
