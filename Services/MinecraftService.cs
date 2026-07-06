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

    public static MinecraftService Current { get; } = new MinecraftService();

    public event Action<string>? OnLogReceived;

    public async Task LaunchMinecraft()
    {
        //避免null導致炸裂
        if (InstanceService.Current.SelectedInstance == null)
            return;


        //排列組合
        var InstanceName = InstanceService.Current.SelectedInstance.Name;
        var LauncherPath = Windows.Storage.ApplicationData.Current.LocalFolder.Path;

        await CreateGameDir(InstanceName);

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
        {
            if (!string.IsNullOrEmpty(log))
            {
                // 觸發全域事件，把 log 往前端頁面丟
                OnLogReceived?.Invoke($"{log}\n");
            }
        };

        processWrapper.StartWithEvents();
        OnLogReceived?.Invoke("[SYSTEM] 遊戲進程已成功啟動！\n");

        // 5. 非同步等待遊戲關閉並檢查結束代碼
        int exitCode = await processWrapper.WaitForExitTaskAsync();
        if (exitCode == 0)
        {
            OnLogReceived?.Invoke("\n[SYSTEM] 遊戲已正常關閉 (Exit Code: 0)。\n");
        }
        else
        {
            OnLogReceived?.Invoke($"\n[SYSTEM] 遊戲異常終止！錯誤代碼 (Exit Code): {exitCode}\n");
        }

    }

    public async Task installMinecraft(string? version, string? loader, MinecraftLauncher minecraftlauncher)
    {
        if (string.IsNullOrEmpty(version) || string.IsNullOrEmpty(loader))
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

    public async Task CreateGameDir(string InstanceName)
    {
        string folderPath = Path.Combine(Windows.Storage.ApplicationData.Current.LocalFolder.Path, "instances", InstanceName);

        if (!Directory.Exists(folderPath))
        {
            Directory.CreateDirectory(folderPath);
            Console.WriteLine($"Dir Create Successfully：{folderPath}");
        }
        else
        {
            Console.WriteLine("Dir has been created.");
        }

        return;
    }




}

