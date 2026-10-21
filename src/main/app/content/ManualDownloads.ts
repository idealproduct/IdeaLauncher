import { createHash } from "crypto";
import type { RestrictedDownload } from "../../../shared/content";
import type { InstallFile } from "./ContentInstaller";

export function officialDownloadUrl(
  websiteUrl: string,
  fileId: number,
): string {
  const url = new URL(websiteUrl);
  if (
    url.protocol !== "https:" ||
    !["curseforge.com", "www.curseforge.com"].includes(url.hostname)
  )
    throw new Error("CurseForge 專案網址不正確");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/download/${fileId}`;
  url.search = "";
  url.hash = "";
  return url.href;
}

export function restrictedDownloads(
  files: InstallFile[],
  received: ReadonlyMap<number, string>,
): RestrictedDownload[] {
  return [
    ...new Map(
      files
        .filter((item) => !item.project.available)
        .map((item) => [item.file.id, item]),
    ).values(),
  ].map(({ project, file }) => ({
    projectId: project.id,
    fileId: file.id,
    projectName: project.name,
    fileName: file.fileName,
    version: file.displayName,
    url: officialDownloadUrl(project.websiteUrl, file.id),
    received: received.has(file.id),
  }));
}

export function verifyCurseFile(item: InstallFile, data: Buffer): void {
  if (data.length !== item.file.fileLength)
    throw new Error("本機檔案大小與指定版本不符");
  const hashes = item.file.hashes.filter((hash) => [1, 2].includes(hash.algo));
  if (!hashes.length) throw new Error("檔案缺少驗證雜湊");
  for (const hash of hashes)
    if (
      createHash(hash.algo === 1 ? "sha1" : "md5")
        .update(data)
        .digest("hex")
        .toLowerCase() !== hash.value.toLowerCase()
    )
      throw new Error("本機檔案與選取版本不符，請下載指定版本");
}
