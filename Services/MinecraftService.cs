using CmlLib.Core;
using CmlLib.Core.Auth;
using CmlLib.Core.Files;
using CmlLib.Core.ProcessBuilder;
using Microsoft.UI.Xaml.Controls;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Windows.System;
using WinRT.IdeaLauncherVtableClasses;
using CmlLib.Core.FileExtractors;

namespace IdeaLauncher.Services;

public class MinecraftService
{
    
    // Minecraft 安裝相關的邏輯，下載、安裝、更新
    public MinecraftPath minecraftPath = new MinecraftPath();

    public async Task LaunchMinecraft()
    {
        //避免null導致炸裂
        if (InstanceService.Current.SelectedInstance == null)
            return;
        //排列組合
        var InstanceName = InstanceService.Current.SelectedInstance?.Name;
        var LauncherPath = Windows.Storage.ApplicationData.Current.LocalFolder.Path;
        minecraftPath.BasePath = Path.Combine(LauncherPath, "instances", InstanceName);
        minecraftPath.Assets = Path.Combine(LauncherPath, "assets");
        minecraftPath.Library = Path.Combine(LauncherPath, "libraries");
        minecraftPath.Versions = Path.Combine(LauncherPath, "versions");
        minecraftPath.Runtime = Path.Combine(LauncherPath, "runtime");
        minecraftPath.Resource = Path.Combine(LauncherPath, "resources");

        var launcher = new MinecraftLauncher(minecraftPath);
        var loader = InstanceService.Current.SelectedInstance?.Loader;
        var version = InstanceService.Current.SelectedInstance?.MinecraftVersion;
        await installMinecraft(version, loader, launcher);

        var launchOption = new MLaunchOption
        {
            MaximumRamMb = InstanceService.Current.SelectedInstance.RamMB,
            Session = MSession.CreateOfflineSession("Dev"),
        };

        var process = await launcher.BuildProcessAsync(version, launchOption);

        var processWrapper = new ProcessWrapper(process);

        processWrapper.OutputReceived += (sender, log) =>
    Console.WriteLine($"[Game] {log}");

        processWrapper.StartWithEvents();
        var exitCode = await processWrapper.WaitForExitTaskAsync();

    }

    public async Task installMinecraft(string? version, string? loader, MinecraftLauncher minecraftlauncher)
    {
        if (!string.IsNullOrEmpty(version) || !string.IsNullOrEmpty(loader))
            return;



        if (loader == null)
            return;
        if (loader == "Vanilla")
            await minecraftlauncher.InstallAsync(version);
        if (loader == "Forge")
            return;
        if (loader == "Fabric")
            return;
        if (loader == "Neoforge")
            return;
        return;
    }




}

