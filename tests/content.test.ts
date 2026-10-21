import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CurseForgeClient,
  CurseForgeKeyStore,
  downloadContent,
  validateDownloadUrl,
} from "../src/main/app/content/CurseForge";
import {
  inspectPackArchive,
  extractPackOverrides,
  parsePackManifest,
  safeRelativePath,
} from "../src/main/app/content/PackArchive";
import {
  commitContentFiles,
  resolveRequiredFiles,
  fetchCurseFile,
  populatePack,
} from "../src/main/app/content/ContentInstaller";
import {
  isFileCompatible,
  type ContentFile,
  type ContentProject,
} from "../src/shared/content";

const instance = { minecraftVersion: "1.21.1", loader: "fabric" as const };
const file = (id = 101, modId = 1): ContentFile => ({
  id,
  modId,
  displayName: "Version A",
  fileName: `${modId}-${id}.jar`,
  gameVersions: ["1.21.1", "Fabric"],
  releaseType: 1,
  fileDate: "2026-01-01",
  fileLength: 4,
  isAvailable: true,
  hashes: [{ algo: 1, value: "1234" }],
  dependencies: [],
});
const project = (id = 1): ContentProject => ({
  id,
  name: `Project ${id}`,
  summary: "test",
  kind: "mod",
  authors: ["author"],
  websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/test",
  downloads: 10,
  available: true,
});
const cfManifest = {
  manifestType: "minecraftModpack",
  manifestVersion: 1,
  name: "Pinned Pack",
  minecraft: {
    version: "1.21.1",
    modLoaders: [{ id: "fabric-0.16.10", primary: true }],
  },
  files: [{ projectID: 1, fileID: 101, required: true }],
  overrides: "overrides",
};

function zip(
  entries: { path: string; data: string; attributes?: number }[],
): Buffer {
  const parts: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  const crc32 = (data: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const entry of entries) {
    const name = Buffer.from(entry.path),
      data = Buffer.from(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(0x0314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc32(data), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(entry.attributes ?? 0, 38);
    record.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

test("CurseForge search sends official authentication and correct class/version/loader pagination", async () => {
  const request: typeof fetch = async (url, options) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://api.curseforge.com");
    assert.equal(parsed.searchParams.get("classId"), "6");
    assert.equal(parsed.searchParams.get("modLoaderType"), "4");
    assert.equal(parsed.searchParams.get("gameVersion"), "1.21.1");
    assert.equal(parsed.searchParams.get("index"), "20");
    assert.equal(
      (options?.headers as Record<string, string>)["x-api-key"],
      "test-key",
    );
    assert.equal(options?.redirect, "error");
    return Response.json({
      data: [
        {
          id: 1,
          gameId: 432,
          classId: 6,
          name: "test",
          summary: "summary",
          authors: [{ name: "author" }],
          links: { websiteUrl: "https://www.curseforge.com" },
          downloadCount: 123,
        },
      ],
      pagination: { totalCount: 70 },
    });
  };
  const result = await new CurseForgeClient(
    async () => "test-key",
    request,
  ).search({
    query: "test",
    kind: "mod",
    gameVersion: "1.21.1",
    loader: "fabric",
    index: 20,
  });
  assert.equal(result.data[0].kind, "mod");
  assert.equal(result.totalCount, 70);
});

test("missing or refused API access produces actionable errors and never a fake empty success", async () => {
  await assert.rejects(
    new CurseForgeClient(async () => "").search({ query: "", kind: "mod" }),
    /API Key/,
  );
  await assert.rejects(
    new CurseForgeClient(
      async () => "key",
      async () => new Response("", { status: 403 }),
    ).search({ query: "", kind: "mod" }),
    /存取權限/,
  );
});

test("content compatibility requires exact game version and declared mod loader", () => {
  assert.equal(isFileCompatible(file(), instance, "mod"), true);
  assert.equal(
    isFileCompatible(file(), { ...instance, loader: "forge" }, "mod"),
    false,
  );
  assert.equal(
    isFileCompatible(
      { ...file(), gameVersions: ["1.21.1", "NeoForge"] },
      { ...instance, loader: "forge" },
      "mod",
    ),
    false,
  );
  assert.equal(
    isFileCompatible(file(), { ...instance, loader: "vanilla" }, "mod"),
    false,
  );
  assert.equal(
    isFileCompatible(file(), { ...instance, minecraftVersion: "1.21" }, "mod"),
    false,
  );
  assert.equal(
    isFileCompatible(
      file(),
      { ...instance, loader: "vanilla" },
      "resourcepack",
    ),
    true,
  );
  assert.equal(isFileCompatible(file(), instance, "modpack"), false);
});

test("dependency resolution selects compatible required dependencies and terminates cycles", async () => {
  const rootFile = {
    ...file(),
    dependencies: [
      { modId: 2, relationType: 3 },
      { modId: 3, relationType: 2 },
    ],
  };
  const childFile = {
    ...file(202, 2),
    dependencies: [{ modId: 1, relationType: 3 }],
  };
  const client = {
    project: async (id: number) => {
      assert.equal(id, 2);
      return project(id);
    },
    files: async () => ({
      data: [
        { ...file(201, 2), gameVersions: ["1.20.1", "Fabric"] },
        childFile,
      ],
      totalCount: 2,
      pageSize: 50,
    }),
  } as unknown as CurseForgeClient;
  const result = await resolveRequiredFiles(
    client,
    { project: project(), file: rootFile },
    instance,
  );
  assert.deepEqual(
    result.map((item) => item.file.id),
    [101, 202],
  );
});

test("downloads verify hashes and reject unsafe sources or redirected private addresses", async () => {
  const data = Buffer.from("test");
  const hashes = [
    {
      algorithm: "sha1" as const,
      value: createHash("sha1").update(data).digest("hex"),
    },
  ];
  const result = await downloadContent(
    "https://cdn.modrinth.com/test",
    hashes,
    1024,
    async () => new Response(data),
  );
  assert.deepEqual(result, data);
  await assert.rejects(
    downloadContent(
      "https://cdn.modrinth.com/test",
      hashes,
      1024,
      async () => new Response("wrong"),
    ),
    /雜湊/,
  );
  await assert.rejects(
    downloadContent(
      "https://cdn.modrinth.com/test",
      hashes,
      2,
      async () => new Response(data),
    ),
    /大小限制/,
  );
  await assert.rejects(
    downloadContent(
      "https://cdn.modrinth.com/test",
      hashes,
      1024,
      async () =>
        new Response("", {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
    ),
    /來源/,
  );
  assert.throws(() => validateDownloadUrl("https://evil-forgecdn.net/test"));
});

test("CurseForge manifests pin exact loader and file versions; unsupported formats fail early", () => {
  const plan = parsePackManifest(cfManifest, "curseforge");
  assert.equal(plan.loader, "fabric");
  assert.equal(plan.loaderVersion, "0.16.10");
  assert.deepEqual(plan.curseFiles, [{ projectID: 1, fileID: 101 }]);
  assert.throws(() =>
    parsePackManifest(
      {
        ...cfManifest,
        minecraft: {
          ...cfManifest.minecraft,
          modLoaders: [{ id: "quilt-0.1" }],
        },
      },
      "curseforge",
    ),
  );
  assert.throws(() =>
    parsePackManifest({ ...cfManifest, manifestVersion: 2 }, "curseforge"),
  );
});

test("MRPACK manifests keep client content and hashes, and reject duplicate/traversal targets", () => {
  const item = {
    path: "mods/example.jar",
    downloads: ["https://cdn.modrinth.com/test"],
    hashes: { sha1: "a".repeat(40), sha512: "b".repeat(128) },
    fileSize: 4,
  };
  const manifest = {
    formatVersion: 1,
    game: "minecraft",
    name: "MR Pack",
    dependencies: { minecraft: "1.21.1", neoforge: "21.1.1" },
    files: [
      item,
      { ...item, path: "mods/server.jar", env: { client: "unsupported" } },
    ],
  };
  const plan = parsePackManifest(manifest, "modrinth");
  assert.equal(plan.loaderVersion, "21.1.1");
  assert.equal(plan.remoteFiles.length, 1);
  assert.equal(plan.needsApiKey, false);
  assert.throws(() =>
    parsePackManifest({ ...manifest, files: [item, item] }, "modrinth"),
  );
  assert.throws(() =>
    parsePackManifest(
      { ...manifest, files: [{ ...item, path: "../escape" }] },
      "modrinth",
    ),
  );
  assert.throws(() =>
    parsePackManifest(
      { ...manifest, files: [{ ...item, hashes: {} }] },
      "modrinth",
    ),
  );
});

test("archive import extracts client overrides in order and never copies server-only content", async () => {
  const archive = zip([
    {
      path: "modrinth.index.json",
      data: JSON.stringify({
        formatVersion: 1,
        game: "minecraft",
        name: "MR Pack",
        dependencies: { minecraft: "1.21.1" },
        files: [],
      }),
    },
    { path: "overrides/config/test.txt", data: "base" },
    { path: "client-overrides/config/test.txt", data: "client" },
    { path: "server-overrides/config/server.txt", data: "server" },
  ]);
  const directory = await mkdtemp(join(tmpdir(), "idea-archive-test-"));
  try {
    const plan = await inspectPackArchive(archive);
    await extractPackOverrides(archive, plan, directory);
    assert.equal(
      await readFile(join(directory, "config/test.txt"), "utf8"),
      "client",
    );
    await assert.rejects(readFile(join(directory, "config/server.txt")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("archive validation rejects traversal, symbolic links, duplicate paths and reserved launcher files", async () => {
  const manifest = { path: "manifest.json", data: JSON.stringify(cfManifest) };
  await assert.rejects(
    inspectPackArchive(
      zip([manifest, { path: "../outside.txt", data: "bad" }]),
    ),
  );
  await assert.rejects(
    inspectPackArchive(
      zip([
        manifest,
        { path: "overrides/link", data: "target", attributes: 0xa1ff0000 },
      ]),
    ),
  );
  await assert.rejects(
    inspectPackArchive(
      zip([
        manifest,
        { path: "overrides/A.txt", data: "a" },
        { path: "overrides/a.txt", data: "b" },
      ]),
    ),
  );
  for (const path of [
    "../bad",
    "C:/bad",
    "config/a:stream",
    "mods/CON.jar",
    "instance.json",
    ".idealauncher-content.json",
    "/root",
  ])
    assert.throws(() => safeRelativePath(path));
});

test("content commits replace old versions and roll back earlier writes on a later failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-content-test-"));
  try {
    await mkdir(join(root, "mods"));
    await mkdir(join(root, ".stage"));
    await writeFile(join(root, "mods/old.jar"), "old");
    await writeFile(
      join(root, ".idealauncher-content.json"),
      JSON.stringify([
        { projectId: 1, fileId: 100, path: "mods/old.jar", kind: "mod" },
      ]),
    );
    await writeFile(join(root, ".stage/101"), "new");
    await assert.rejects(
      commitContentFiles(root, join(root, ".stage"), [
        { project: project(), file: file() },
        { project: project(2), file: file(202, 2) },
      ]),
    );
    assert.equal(await readFile(join(root, "mods/old.jar"), "utf8"), "old");
    await assert.rejects(readFile(join(root, "mods/1-101.jar")));
    assert.equal(
      JSON.parse(
        await readFile(join(root, ".idealauncher-content.json"), "utf8"),
      )[0].fileId,
      100,
    );
    await writeFile(join(root, ".stage/101"), "new");
    await commitContentFiles(root, join(root, ".stage"), [
      { project: project(), file: file() },
    ]);
    assert.equal(await readFile(join(root, "mods/1-101.jar"), "utf8"), "new");
    await assert.rejects(readFile(join(root, "mods/old.jar")));
    assert.equal(
      JSON.parse(
        await readFile(join(root, ".idealauncher-content.json"), "utf8"),
      )[0].fileId,
      101,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restricted projects accept only an explicitly selected local file matching the pinned hash", async () => {
  const data = Buffer.from("test");
  const restricted = {
    project: { ...project(), available: false },
    file: {
      ...file(),
      hashes: [
        { algo: 1, value: createHash("sha1").update(data).digest("hex") },
      ],
    },
  };
  const client = {
    downloadUrl: async () => {
      throw new Error("automatic download forbidden");
    },
  } as unknown as CurseForgeClient;
  assert.deepEqual(
    await fetchCurseFile(client, restricted, async () => data),
    data,
  );
  await assert.rejects(
    fetchCurseFile(client, restricted, async () => Buffer.from("fake")),
    /版本不符/,
  );
  await assert.rejects(fetchCurseFile(client, restricted));
});

test("imported CurseForge packs preserve pinned file inventory for later upgrades", async (t) => {
  const data = Buffer.from("test");
  const pinned = {
    ...file(),
    hashes: [{ algo: 1, value: createHash("sha1").update(data).digest("hex") }],
  };
  const client = {
    project: async () => project(),
    file: async () => pinned,
    downloadUrl: async () => "https://mediafilez.forgecdn.net/test",
  } as unknown as CurseForgeClient;
  t.mock.method(globalThis, "fetch", async () => new Response(data));
  const archive = zip([
    { path: "manifest.json", data: JSON.stringify(cfManifest) },
    { path: "overrides/config/test.txt", data: "settings" },
  ]);
  const root = await mkdtemp(join(tmpdir(), "idea-pack-inventory-"));
  try {
    await populatePack(
      client,
      archive,
      await inspectPackArchive(archive),
      root,
      () => undefined,
    );
    assert.equal(await readFile(join(root, "mods/1-101.jar"), "utf8"), "test");
    const inventory = JSON.parse(
      await readFile(join(root, ".idealauncher-content.json"), "utf8"),
    );
    assert.equal(inventory[0].projectId, 1);
    assert.equal(inventory[0].fileId, 101);
    assert.equal(
      await readFile(join(root, "config/test.txt"), "utf8"),
      "settings",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("API keys are encrypted at rest and only plaintext in memory when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea-key-test-"));
  try {
    const path = join(root, "key.enc");
    const store = new CurseForgeKeyStore(path, {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value).reverse(),
      decryptString: (value) => Buffer.from(value).reverse().toString(),
    });
    await store.save("test-secret");
    assert.notEqual(await readFile(path, "utf8"), "test-secret");
    // Environment-provided credentials legitimately take precedence; never print them.
    const saved = process.env.IDEALAUNCHER_CURSEFORGE_API_KEY;
    const fallback = process.env.CURSEFORGE_API_KEY;
    delete process.env.IDEALAUNCHER_CURSEFORGE_API_KEY;
    delete process.env.CURSEFORGE_API_KEY;
    try {
      assert.equal(await store.get(), "test-secret");
    } finally {
      if (saved !== undefined)
        process.env.IDEALAUNCHER_CURSEFORGE_API_KEY = saved;
      if (fallback !== undefined) process.env.CURSEFORGE_API_KEY = fallback;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
