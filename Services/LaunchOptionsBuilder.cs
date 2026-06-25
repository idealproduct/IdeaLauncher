using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using IdeaLauncher.Models;

namespace IdeaLauncher.Services;

public static class LaunchOptionsBuilder
{
    public static async Task<LaunchOptions>
        BuildAsync(
            InstanceInfo instance)
    {
        var details =
            await MinecraftVersionService
                .GetVersionDetailsAsync(
                    instance.MinecraftVersion);

        string classpath =
            await MinecraftVersionService
                .BuildClasspathAsync(
                    instance.MinecraftVersion);

        return new LaunchOptions
        {
            VersionId =
                instance.MinecraftVersion,

            PlayerName =
                "Steve",

            Uuid =
                Guid.NewGuid()
                    .ToString("N"),

            AccessToken =
                "0",

            GameDirectory =
                instance.GameDirectory,

            AssetsDirectory =
                LauncherPaths.Assets,

            AssetsIndex =
                details?.AssetIndex.Id ?? "",

            JavaPath =
                JavaService
                    .GetJavaExecutable(),

            MainClass =
                details?.MainClass ?? "",

            Classpath =
                classpath,

            MaxMemoryMb =
                instance.RamMb
        };
    }
}