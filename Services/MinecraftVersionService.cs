using IdeaLauncher.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class MinecraftVersionService
{
    public static async Task DownloadVersionJsonAsync(
        string versionId)
    {
        var manifest = await MinecraftManifestService.GetManifestObjectAsync();

        if (manifest == null)
            return;

        var version = 
            manifest.Versions
                    .FirstOrDefault(
                        v => v.Id == versionId);

        if (version == null)
            return;

        using HttpClient client = new();

        string json =
            await client.GetStringAsync(
                version.Url);

        string versionFolder =
            Path.Combine(
                LauncherPaths.Shared,
                "versions",
                versionId);

        Directory.CreateDirectory(
            versionFolder);

        await File.WriteAllTextAsync(
            Path.Combine(
                versionFolder,
                "version.json"),
            json);
        
    }

    public static async Task<
    MinecraftVersionDetails?>
    GetVersionDetailsAsync(
        string versionId)
    {
        string versionFile =
            Path.Combine(
                LauncherPaths.Versions,
                versionId,
                "version.json");

        if (!File.Exists(versionFile))
            return null;

        string json =
            await File.ReadAllTextAsync(
                versionFile);

        return JsonSerializer.Deserialize<
            MinecraftVersionDetails>(
                json);
    }

    public static async Task DownloadClientJarAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
        //return;
        {
            throw new Exception(
                $"找不到 {versionId} 的 version.json");
        }

        string clientUrl =
            details.Downloads.Client.Url;

        string versionFolder =
            Path.Combine(
                LauncherPaths.Versions,
                versionId);

        string clientJar =
            Path.Combine(
                versionFolder,
                "client.jar");

        await DownloadService
            .DownloadFileAsync(
                clientUrl,
                clientJar);
    }

    public static async Task<List<string>>
    GetLibraryNamesAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return new();

        return details.Libraries
                      .Select(l => l.Name)
                      .ToList();
    }

    public static async Task DownloadFirstLibraryAsync(
    string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return;

        var library =
            details.Libraries
                   .FirstOrDefault(
                       l => l.Downloads?.Artifact != null);

        if (library == null)
            return;

        string url =
            library.Downloads!
                   .Artifact!
                   .Url;

        string relativePath =
            library.Downloads
                   .Artifact
                   .Path;

        string outputFile =
            Path.Combine(
                LauncherPaths.Libraries,
                relativePath);

        string? folder =
            Path.GetDirectoryName(
                outputFile);

        if (folder != null)
        {
            Directory.CreateDirectory(
                folder);
        }

        await DownloadService
            .DownloadFileAsync(
                url,
                outputFile);
    }

    public static async Task DownloadLibrariesAsync(
    string versionId,
    int limit = int.MaxValue)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return;

        int count = 0;

        foreach (var library in details.Libraries)
        {
            if (count >= limit)
                break;

            var artifact =
                library.Downloads?.Artifact;

            if (artifact == null)
                continue;

            string outputFile =
                Path.Combine(
                    LauncherPaths.Libraries,
                    artifact.Path);

            if (File.Exists(outputFile))
            {
                count++;
                continue;
            }

            string? folder =
                Path.GetDirectoryName(
                    outputFile);

            if (folder != null)
            {
                Directory.CreateDirectory(
                    folder);
            }

            await DownloadService
                .DownloadFileAsync(
                    artifact.Url,
                    outputFile);

            count++;
        }
    }

    public static async Task DownloadAssetIndexAsync(
    string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return;

        using HttpClient client = new();

        string json =
            await client.GetStringAsync(
                details.AssetIndex.Url);

        string indexesFolder =
            Path.Combine(
                LauncherPaths.Assets,
                "indexes");

        Directory.CreateDirectory(
            indexesFolder);

        string file =
            Path.Combine(
                indexesFolder,
                $"{details.AssetIndex.Id}.json");

        await File.WriteAllTextAsync(
            file,
            json);
    }

    public static async Task<AssetIndexFile?>
    GetAssetIndexAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return null;

        string file =
            Path.Combine(
                LauncherPaths.Assets,
                "indexes",
                $"{details.AssetIndex.Id}.json");

        if (!File.Exists(file))
            return null;

        string json =
            await File.ReadAllTextAsync(
                file);

        return JsonSerializer.Deserialize<
            AssetIndexFile>(json);
    }

    public static async Task DownloadAssetsAsync(
    string versionId)
    {
        var index =
            await GetAssetIndexAsync(
                versionId);

        if (index == null)
            return;

        foreach (var asset in index.Objects)
        {
            string hash =
                asset.Value.Hash;

            string folder =
                hash[..2];

            string url =
                $"https://resources.download.minecraft.net/{folder}/{hash}";

            string outputFile =
                Path.Combine(
                    LauncherPaths.Assets,
                    "objects",
                    folder,
                    hash);

            if (File.Exists(outputFile))
                continue;

            Directory.CreateDirectory(
                Path.GetDirectoryName(
                    outputFile)!);

            await DownloadService
                .DownloadFileAsync(
                    url,
                    outputFile);
        }
    }

    public static async Task InstallMinecraftAsync(
    string versionId)
    {
        await DownloadVersionJsonAsync(
            versionId);

        await DownloadClientJarAsync(
            versionId);

        await DownloadLibrariesAsync(
            versionId,
            int.MaxValue);

        await DownloadAssetIndexAsync(
            versionId);

        await DownloadAssetsAsync(
            versionId);
    }

    public static async Task<string>
    GetLaunchInfoAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return "Version not found";

        return
            $"Main Class: {details.MainClass}\n" +
            $"Java: {details.JavaVersion.MajorVersion}";
    }

    public static async Task<List<string>>
    GetLibraryPathsAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return new();

        List<string> paths = new();

        foreach (var library in details.Libraries)
        {
            var artifact =
                library.Downloads?.Artifact;

            if (artifact == null)
                continue;

            string file =
                Path.Combine(
                    LauncherPaths.Libraries,
                    artifact.Path);

            if (File.Exists(file))
            {
                paths.Add(file);
            }
        }

        return paths;
    }

    public static async Task<string>
    BuildClasspathAsync(
        string versionId)
    {
        var libraries =
            await GetLibraryPathsAsync(
                versionId);

        string clientJar =
            Path.Combine(
                LauncherPaths.Versions,
                versionId,
                "client.jar");

        libraries.Add(clientJar);

        return string.Join(
            Path.PathSeparator,
            libraries);
    }

    public static async Task<string>
    GetClasspathPreviewAsync(
        string versionId)
    {
        string cp =
            await BuildClasspathAsync(
                versionId);

        return cp.Length > 300
            ? cp[..300]
            : cp;
    }

    public static async Task<string>
    GetArgumentsPreviewAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return "No Version";

        var gameArgs =
            details.Arguments.Game
                   .Take(20)
                   .Select(x => x.ToString());

        return string.Join(
            Environment.NewLine,
            gameArgs);
    }

    public static async Task<string>
    DebugNativeLibrariesAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return "No Version";

        StringBuilder sb =
            new();

        foreach (var lib in details.Libraries)
        {
            var native =
                lib.Downloads?
                   .Classifiers?
                   .NativesWindows;

            if (native == null)
                continue;

            sb.AppendLine(
                native.Path);
        }

        return sb.ToString();
    }

    public static async Task
    DownloadNativesAsync(
        string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return;

        foreach (var lib in details.Libraries)
        {
            if (!lib.Name.Contains(
                "natives-windows"))
                continue;

            var artifact =
                lib.Downloads?.Artifact;

            if (artifact == null)
                continue;

            string file =
                Path.Combine(
                    LauncherPaths.Libraries,
                    artifact.Path);

            Directory.CreateDirectory(
                Path.GetDirectoryName(file)!);

            if (File.Exists(file))
                continue;

            await DownloadService
                .DownloadFileAsync(
                    artifact.Url,
                    file);
        }
    }

    public static async Task ExtractNativesAsync(
    string versionId)
    {
        var details =
            await GetVersionDetailsAsync(
                versionId);

        if (details == null)
            return;

        string nativesFolder =
            LauncherPaths.GetVersionNatives(
                versionId);

        Directory.CreateDirectory(
            nativesFolder);

        foreach (var lib in details.Libraries)
        {
            var artifact =
                lib.Downloads?.Artifact;

            if (artifact == null)
                continue;

            if (!artifact.Path.Contains(
                "natives-windows"))
                continue;

            string jarFile =
                Path.Combine(
                    LauncherPaths.Libraries,
                    artifact.Path);

            if (!File.Exists(jarFile))
                continue;

            using ZipArchive archive =
                ZipFile.OpenRead(
                    jarFile);

            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(
                    entry.Name))
                    continue;

                if (entry.FullName.StartsWith(
                    "META-INF"))
                    continue;

                string output =
                    Path.Combine(
                        nativesFolder,
                        entry.Name);

                entry.ExtractToFile(
                    output,
                    true);
            }
        }
    }
}