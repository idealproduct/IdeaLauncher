using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;
using IdeaLauncher.Models;
using IdeaLauncher.Services;
using Windows.Security.Cryptography.Core;
using System.Threading.Tasks;
using IdeaLauncher.Views;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace IdeaLauncher
{
    /// <summary>
    /// An empty window that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainWindow : Window
    {
        private LauncherSettings _settings = new();

        private InstanceInfo? _selectedInstance;

        private double _downloadProgress;
        public MainWindow()
        {
            InitializeComponent();

            LauncherPaths.EnsureDirectories();

            RefreshInstances();

            _ = TestSettings();
        }

        private void RefreshInstances()
        {
            InstanceList.ItemsSource =
                InstanceService.GetInstances();
        }

        private async void CreateInstance_Click(
    object sender,
    RoutedEventArgs e)
        {
            var dialog =
                new InstanceCreateDialog();

            dialog.XamlRoot =
                Content.XamlRoot;

            var result =
                await dialog.ShowAsync();

            if (result != ContentDialogResult.Primary)
                return;

            if (string.IsNullOrWhiteSpace(
                dialog.InstanceName))
                return;

            var instance =
                new InstanceInfo
                {
                    Name =
                        dialog.InstanceName,

                    MinecraftVersion =
                        dialog.MinecraftVersion,

                    Loader =
                        dialog.Loader,

                    RamMb =
                        dialog.RamMb
                };

            await InstanceInstallService
                .InstallAsync(
                    instance);

            await InstanceService
                .CreateInstanceAsync(
                    instance);

            RefreshInstances();
        }

        private void InstanceList_SelectionChanged(
            object sender,
            SelectionChangedEventArgs e)
        {
            if (InstanceList.SelectedItem is not InstanceInfo instance)
                return;

            _selectedInstance = instance;

            NameText.Text = instance.Name;

            VersionText.Text =
                instance.MinecraftVersion;

            LoaderText.Text =
                instance.Loader;

            RamText.Text =
                $"{instance.RamMb} MB";
        }

        private async void InstanceList_DoubleTapped(
            object sender,
            Microsoft.UI.Xaml.Input.DoubleTappedRoutedEventArgs e)
        {
            if (_selectedInstance == null)
                return;

            var dialog =
                new InstanceCreateDialog();

            dialog.XamlRoot = Content.XamlRoot;

            dialog.LoadInstance(
                _selectedInstance);

            var result =
                await dialog.ShowAsync();

            if (result != ContentDialogResult.Primary)
                return;

            string oldName = _selectedInstance.Name;

            _selectedInstance.Name =
                dialog.InstanceName;

            _selectedInstance.Loader =
                dialog.Loader;

            _selectedInstance.RamMb =
                dialog.RamMb;

            _selectedInstance.MinecraftVersion =
                dialog.MinecraftVersion;

            if (oldName != _selectedInstance.Name)
            {
                InstanceService.RenameInstance(
                    oldName,
                    _selectedInstance.Name);
            }

            await InstanceService.SaveInstanceAsync(
                _selectedInstance);

            RefreshInstances();
        }

        private async void DeleteInstance_Click(
    object sender,
    RoutedEventArgs e)
        {
            try
            {
                if (_selectedInstance == null)
                    return;

                var dialog = new ContentDialog
                {
                    Title = "刪除實例",
                    Content =
                        $"確定要刪除 {_selectedInstance.Name} 嗎？",
                    PrimaryButtonText = "刪除",
                    CloseButtonText = "取消",
                    XamlRoot = Content.XamlRoot
                };

                var result = await dialog.ShowAsync();

                if (result != ContentDialogResult.Primary)
                    return;

                InstanceService.DeleteInstance(
                    _selectedInstance.Name);

                _selectedInstance = null;

                RefreshInstances();

                NameText.Text = "";
                VersionText.Text = "";
                LoaderText.Text = "";
                RamText.Text = "";
            }
            catch (Exception ex)
            {
                var errorDialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await errorDialog.ShowAsync();
            }
        }

        private async Task TestSettings()
        {
            _settings =
                await SettingsService.LoadAsync();

            _settings.JavaPath =
                @"C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot\bin\java.exe";

            await SettingsService.SaveAsync(
                _settings);
        }

        private async void TestJava_Click(
            object sender,
            RoutedEventArgs e)
        {
            _settings =
                await SettingsService.LoadAsync();

            string version =
                await JavaService.GetJavaVersionAsync(
                    _settings.JavaPath);

            var dialog = new ContentDialog
            {
                Title = "Java Version",
                Content = version,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ListRuntime_Click(
            object sender,
            RoutedEventArgs e)
        {
            var runtimes =
                RuntimeService.GetInstalledRuntimes();

            string text =
                string.Join(
                    Environment.NewLine,
                    runtimes.Select(
                        r => $"""
                            {r.Name}
                            Version: {r.Version}
                            Vendor: {r.Vendor}
                            Architecture: {r.Architecture}
                            """));

            if (string.IsNullOrWhiteSpace(text))
            {
                text = "沒有 Runtime";
            }

            var dialog = new ContentDialog
            {
                Title = "Installed Runtimes",
                Content = text,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void AvailableRuntime_Click(
            object sender,
            RoutedEventArgs e)
        {
            var runtimes =
                RuntimeService.GetAvailableRuntimes();

            string text =
                string.Join(
                    Environment.NewLine,
                    runtimes.Select(
                        r => $"{r.Name}"));

            var dialog = new ContentDialog
            {
                Title = "Available Runtime",
                Content = text,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void TestDownload_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                string file =
                    Path.Combine(
                        LauncherPaths.Downloads,
                        "test.txt");

                await DownloadService.DownloadFileAsync(
                    "https://www.google.com/robots.txt",
                    file);

                var dialog = new ContentDialog
                {
                    Title = "下載成功",
                    Content = file,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "下載失敗",
                    Content = ex.Message,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void TestDownloadProgress_Click(
            object sender,
            RoutedEventArgs e)
        {
            string file =
                Path.Combine(
                    LauncherPaths.Downloads,
                    "test.txt");

            await DownloadService
                .DownloadFileWithProgressAsync(
                    "https://www.google.com/robots.txt",
                    file,
                    progress =>
                    {
                        _downloadProgress = progress;

                        DispatcherQueue.TryEnqueue(() =>
                        {
                            ProgressText.Text =
                                $"{progress:F1}%";
                        });
                    });

            ProgressText.Text = "完成";
        }

        private async void TestExtract_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                string zip =
                    Path.Combine(
                        LauncherPaths.Downloads,
                        "test.zip");

                string extractFolder =
                    Path.Combine(
                        LauncherPaths.Downloads,
                        "Extracted");

                ZipService.Extract(
                    zip,
                    extractFolder);

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = extractFolder,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void InstallRuntime_Click(
            object sender,
            RoutedEventArgs e)
        {
            await RuntimeService
                .InstallRuntimeAsync(
                    "java-21");

            //RefreshRuntimeList();
            var runtimes = RuntimeService.GetInstalledRuntimes();

            var dialog = new ContentDialog
            {
                Title = "完成",
                Content = "Runtime 已安裝",
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void GetVersions_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                string json = await MinecraftManifestService.GetManifestAsync();

                var dialog = new ContentDialog
                {
                    Title = "Success",
                    Content = $"Finish downloading /n{json.Length} long",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "Error",
                    Content = ex.Message,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void ShowVersions_Click(object sender, RoutedEventArgs e)
        {
            var manifest = await MinecraftManifestService.GetManifestObjectAsync();

            if (manifest == null)
                return;

            string text =
                string.Join(
                    Environment.NewLine,
                    manifest.Versions
                        .Take(20)
                        .Select(v => v.Id));

            var dialog = new ContentDialog
            {
                Title = "Minecraft Versions",
                Content = text,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void DownloadVersion_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                await MinecraftVersionService.DownloadVersionJsonAsync("1.21.8");

                var dialog = new ContentDialog
                {
                    Title = "Success",
                    Content = "version.json downloaded successfully",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "Error",
                    Content = ex.Message,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };
                await dialog.ShowAsync();
            }
        }

        private async void DownloadClient_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                await MinecraftVersionService
                    .DownloadClientJarAsync(
                        "1.21.8");

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = "client.jar 已下載",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.Message,
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void ShowLibraries_Click(
            object sender,
            RoutedEventArgs e)
        {
            var libs =
                await MinecraftVersionService
                    .GetLibraryNamesAsync(
                        "1.21.8");

            string text =
                string.Join(
                    Environment.NewLine,
                    libs.Take(30));

            var dialog = new ContentDialog
            {
                Title = "Libraries",
                Content = text,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void DownloadLibraries_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                await MinecraftVersionService
                    .DownloadLibrariesAsync(
                        "1.21.8");

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = "已下載前10個 Libraries",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void DownloadAssetIndex_Click(
            object sender,
            RoutedEventArgs e)
        {
            await MinecraftVersionService
                .DownloadAssetIndexAsync(
                    "1.21.8");

            var dialog = new ContentDialog
            {
                Title = "完成",
                Content = "Asset Index 已下載",
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void DownloadAssets_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                await MinecraftVersionService
                    .DownloadAssetsAsync(
                        "1.21.8");

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content =
                        "已下載前10個Assets",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void InstallMinecraft_Click(
            object sender,
            RoutedEventArgs e)
        {
            try
            {
                await MinecraftVersionService
                    .InstallMinecraftAsync(
                        "1.21.8");

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = "Minecraft 安裝完成",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void ShowLaunchInfo_Click(
                object sender,
                RoutedEventArgs e)
        {
            string info =
                await MinecraftVersionService
                    .GetLaunchInfoAsync(
                        "1.21.8");

            var dialog = new ContentDialog
            {
                Title = "Launch Info",
                Content = info,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ShowClasspath_Click(
            object sender,
            RoutedEventArgs e)
        {
            string cp =
                await MinecraftVersionService
                    .GetClasspathPreviewAsync(
                        "1.21.8");

            var dialog = new ContentDialog
            {
                Title = "Classpath",
                Content = cp,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ShowArguments_Click(
            object sender,
            RoutedEventArgs e)
        {

            string args =
                await MinecraftVersionService
                    .GetArgumentsPreviewAsync(
                        "1.21.8");

            var dialog = new ContentDialog
            {
                Title = "Arguments",
                Content = args,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void TestLaunchArgs_Click(
    object sender,
    RoutedEventArgs e)
        {
            var options =
                new LaunchOptions
                {
                    PlayerName = "Steve",

                    VersionId = "1.21.8",

                    GameDirectory =
                        LauncherPaths.Root,

                    AssetsDirectory =
                        LauncherPaths.Assets,

                    AssetsIndex = "24"
                };

            var args =
                await MinecraftLaunchService
                    .BuildGameArgumentsAsync(
                        options);

            string preview =
                string.Join(
                    Environment.NewLine,
                    args.Take(20));

            var dialog = new ContentDialog
            {
                Title = "Launch Args",
                Content = preview,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ShowJvmArgs_Click(
    object sender,
    RoutedEventArgs e)
        {
            var options =
                new LaunchOptions
                {
                    PlayerName = "Steve",
                    VersionId = "1.21.8",
                    GameDirectory =
                        LauncherPaths.Root,
                    AssetsDirectory =
                        LauncherPaths.Assets,
                    AssetsIndex = "24"
                };

            var args =
                await MinecraftLaunchService
                    .BuildJvmArgumentsAsync(
                        options);

            string preview =
                $"Count = {args.Count}\n\n" +
                string.Join(
                    Environment.NewLine,
                    args.Take(20));

            var dialog = new ContentDialog
            {
                Title = "JVM Args",
                Content = preview,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void BuildLaunchCommand_Click(
    object sender,
    RoutedEventArgs e)
        {
            string cp =
                await MinecraftVersionService
                    .BuildClasspathAsync(
                        "1.21.8");

            var details =
                await MinecraftVersionService
                    .GetVersionDetailsAsync(
                        "1.21.8");

            var options =
                new LaunchOptions
                {
                    PlayerName = "Steve",

                    VersionId = "1.21.8",

                    GameDirectory =
                        LauncherPaths.Root,

                    AssetsDirectory =
                        LauncherPaths.Assets,

                    AssetsIndex =
                        details?.AssetIndex.Id ?? "",

                    JavaPath =
                        Path.Combine(
                            LauncherPaths.Java,
                            "bin",
                            "java.exe"),

                    Classpath = cp,

                    MainClass =
                        details?.MainClass ?? ""
                };

            string command =
                await MinecraftLaunchService
                    .BuildLaunchCommandAsync(
                        options);

            var dialog = new ContentDialog
            {
                Title = "Launch Command",
                Content =
                    command.Length > 1000
                        ? command[..1000]
                        : command,

                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void CheckJava_Click(
    object sender,
    RoutedEventArgs e)
        {
            bool installed =
                JavaService.IsJavaInstalled();

            var dialog = new ContentDialog
            {
                Title = "Java",
                Content =
                    installed
                    ? "已安裝"
                    : "未安裝",

                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void DownloadJava_Click(
    object sender,
    RoutedEventArgs e)
        {
            try
            {
                await JavaService
                    .DownloadJavaAsync();

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = "Java ZIP 已下載",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void ExtractJava_Click(
    object sender,
    RoutedEventArgs e)
        {
            try
            {
                JavaService.ExtractJava();

                var dialog = new ContentDialog
                {
                    Title = "完成",
                    Content = "Java 已解壓",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
            catch (Exception ex)
            {
                var dialog = new ContentDialog
                {
                    Title = "錯誤",
                    Content = ex.ToString(),
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

                await dialog.ShowAsync();
            }
        }

        private async void JavaVersion_Click(
    object sender,
    RoutedEventArgs e)
        {
            string version =
                JavaService.GetJavaVersion();

            var dialog = new ContentDialog
            {
                Title = "Java",
                Content = version,
                CloseButtonText = "確定",
                XamlRoot = Content.XamlRoot
            };

            await dialog.ShowAsync();
        }

        private async void ShowNatives_Click(
    object sender,
    RoutedEventArgs e)
        {

            await MinecraftVersionService.DownloadNativesAsync("1.21.8");
            string text =
                await MinecraftVersionService
                    .DebugNativeLibrariesAsync(
                        "1.21.8");

            var dialog =
                new ContentDialog
                {
                    Title = "Natives",
                    Content =
                        text.Length > 1000
                        ? text[..1000]
                        : text,

                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

            await dialog.ShowAsync();
        }

        private async void ExtractNatives_Click(
    object sender,
    RoutedEventArgs e)
        {
            await MinecraftVersionService
                .ExtractNativesAsync(
                    "1.21.8");

            var dialog =
                new ContentDialog
                {
                    Title = "完成",
                    Content = "Natives 已解壓",
                    CloseButtonText = "確定",
                    XamlRoot = Content.XamlRoot
                };

            await dialog.ShowAsync();
        }

        private async void Launch_Click(
    object sender,
    RoutedEventArgs e)
        {
            if (_selectedInstance == null)
                return;

            await MinecraftLaunchService
                .LaunchInstanceAsync(
                    _selectedInstance);
        }
    }
}
