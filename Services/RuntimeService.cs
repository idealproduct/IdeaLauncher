using IdeaLauncher.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json;

namespace IdeaLauncher.Services;

public static class RuntimeService
{
    public static List<JavaRuntimeInfo>
    GetInstalledRuntimes()
    {
        List<JavaRuntimeInfo> runtimes = new();

        if (!Directory.Exists(
            LauncherPaths.Runtimes))
        {
            return runtimes;
        }

        foreach (string folder in
                 Directory.GetDirectories(
                     LauncherPaths.Runtimes))
        {
            string metadataFile =
                Path.Combine(
                    folder,
                    "runtime.json");

            if (!File.Exists(metadataFile))
                continue;

            try
            {
                string json =
                    File.ReadAllText(
                        metadataFile);

                JavaRuntimeInfo? runtime =
                    JsonSerializer.Deserialize<JavaRuntimeInfo>(
                        json);

                if (runtime == null)
                    continue;

                runtime.JavaPath =
                    Path.Combine(
                        folder,
                        "bin",
                        "java.exe");

                runtimes.Add(runtime);
            }
            catch
            {
            }
        }

        return runtimes;
    }

    public static List<RuntimeDownloadInfo>
    GetAvailableRuntimes()
    {
        return new()
    {
        new RuntimeDownloadInfo
        {
            Name = "Temurin 21",
            Version = "21",
            FolderName = "java-21",

            DownloadUrl =
                "https://example.com"
        }
    };
    }

    public static async Task InstallRuntimeAsync(
    string runtimeName)
    {
        string runtimeFolder =
            Path.Combine(
                LauncherPaths.Runtimes,
                runtimeName);

        Directory.CreateDirectory(
            runtimeFolder);

        JavaRuntimeInfo runtime =
            new()
            {
                Name = $"Temurin {runtimeName}",
                Version = runtimeName,
                Architecture = "x64",
                Vendor = "Eclipse Adoptium"
            };

        string metadataFile =
            Path.Combine(
                runtimeFolder,
                "runtime.json");

        string json =
            System.Text.Json.JsonSerializer.Serialize(
                runtime,
                new System.Text.Json.JsonSerializerOptions
                {
                    WriteIndented = true
                });

        await File.WriteAllTextAsync(
            metadataFile,
            json);
    }
}