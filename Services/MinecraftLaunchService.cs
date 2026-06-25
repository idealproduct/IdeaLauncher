using IdeaLauncher.Models;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class MinecraftLaunchService
{

    private static string ReplaceVariables(
    string input,
    LaunchOptions options)
    {
        return input
            .Replace(
                "${auth_player_name}",
                options.PlayerName)

            .Replace(
                "${version_name}",
                options.VersionId)

            .Replace(
                "${game_directory}",
                options.GameDirectory)

            .Replace(
                "${assets_root}",
                options.AssetsDirectory)

            .Replace(
                "${assets_index_name}",
                options.AssetsIndex)

            .Replace(
                "${auth_uuid}",
                options.Uuid)

            .Replace(
                "${auth_access_token}",
                options.AccessToken);
    }

    public static async Task<List<string>>
        BuildGameArgumentsAsync(
            LaunchOptions options)
    {
        var details =
            await MinecraftVersionService
                .GetVersionDetailsAsync(
                    options.VersionId);

        if (details == null)
            return new();

        List<string> args =
            new();

        foreach (var item in details.Arguments.Game)
        {
            if (item.ValueKind ==
                JsonValueKind.String)
            {
                args.Add(
                    ReplaceVariables(
                        item.GetString() ?? "",
                        options));

                continue;
            }

            if (item.ValueKind ==
                JsonValueKind.Object)
            {
                if (!item.TryGetProperty(
                    "value",
                    out JsonElement valueElement))
                    continue;

                if (valueElement.ValueKind ==
                    JsonValueKind.String)
                {
                    args.Add(
                        ReplaceVariables(
                            valueElement.GetString()
                            ?? "",
                            options));
                }
                else if (
                    valueElement.ValueKind ==
                    JsonValueKind.Array)
                {
                    foreach (
                        var value
                        in valueElement
                            .EnumerateArray())
                    {
                        args.Add(
                            ReplaceVariables(
                                value.GetString()
                                ?? "",
                                options));
                    }
                }
            }
        }

        File.WriteAllLines(
            Path.Combine(
                LauncherPaths.Root,
                "gameargs.txt"),
            args);

        return args;
    }

    public static async Task<List<string>>
    BuildJvmArgumentsAsync(
        LaunchOptions options)
    {
        var details =
            await MinecraftVersionService
                .GetVersionDetailsAsync(
                    options.VersionId);

        List<string> args =
            new();

        if (details == null)
            return args;

        string nativesDir =
            LauncherPaths.GetVersionNatives(
                options.VersionId);

        foreach (var arg in details.Arguments.Jvm)
        {
            if (arg.ValueKind != JsonValueKind.String)
                continue;

            string value =
                arg.GetString() ?? "";

            // 我們自己處理 classpath
            if (value == "-cp")
                continue;

            if (value == "${classpath}")
                continue;

            // Placeholder 替換
            value = value.Replace(
                "${natives_directory}",
                nativesDir);

            value = value.Replace(
                "${launcher_name}",
                "IdeaLauncher");

            value = value.Replace(
                "${launcher_version}",
                "1.0");

            value = value.Replace(
                "${classpath_separator}",
                Path.PathSeparator.ToString());

            value = value.Replace(
                "${library_directory}",
                LauncherPaths.Libraries);

            args.Add(value);
        }

        // 自己補 RAM
        args.Add(
            $"-Xmx{options.MaxMemoryMb}M");

        // 保險起見再補一次
        args.Add(
            $"-Djava.library.path={nativesDir}");

        File.WriteAllLines(
            Path.Combine(
                LauncherPaths.Root,
                "gameargs.txt"),
                args);

        return args;
    }

    public static async Task<string>
    BuildLaunchCommandAsync(
        LaunchOptions options)
    {
        var jvmArgs =
            await BuildJvmArgumentsAsync(
                options);

        var gameArgs =
            await BuildGameArgumentsAsync(
                options);

        List<string> command = new();

        command.Add(
            $"\"{options.JavaPath}\"");

        command.AddRange(
            jvmArgs);

        command.Add("-cp");

        command.Add(
            $"\"{options.Classpath}\"");

        command.Add(
            options.MainClass);

        command.AddRange(
            gameArgs);

        return string.Join(
            " ",
            command);
    }

    public static async Task LaunchAsync(
    LaunchOptions options)
    {
        var jvmArgs =
            await BuildJvmArgumentsAsync(
                options);

        var gameArgs =
            await BuildGameArgumentsAsync(
                options);

        string arguments =
            string.Join(" ", jvmArgs)
            + " -cp "
            + $"\"{options.Classpath}\" "
            + options.MainClass
            + " "
            + string.Join(" ", gameArgs);

        ProcessStartInfo psi =
            new()
            {
                FileName =
                    options.JavaPath,

                Arguments =
                    arguments,

                UseShellExecute = false,

                WorkingDirectory =
                    options.GameDirectory
            };

    //    File.WriteAllText(
    //Path.Combine(
    //    LauncherPaths.Root,
    //    "launch.txt"),
    //arguments);

        Process.Start(psi);
    }

    private static string
    ReplaceJvmVariables(
        string value,
        LaunchOptions options,
        string nativesDir)
    {
        return value
            .Replace(
                "${natives_directory}",
                nativesDir)

            .Replace(
                "${launcher_name}",
                "IdeaLauncher")

            .Replace(
                "${launcher_version}",
                "1.0")

            .Replace(
                "${classpath_separator}",
                Path.PathSeparator
                    .ToString())

            .Replace(
                "${library_directory}",
                LauncherPaths.Libraries)

            .Replace(
                "${classpath}",
                options.Classpath);
    }

    public static async Task
    LaunchInstanceAsync(
        InstanceInfo instance)
    {
        var options =
            await LaunchOptionsBuilder
                .BuildAsync(
                    instance);

        await LaunchAsync(
            options);
    }
}