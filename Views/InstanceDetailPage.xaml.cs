using IdeaLauncher.Models; // 💡 確保有引用你的 Model 命名空間
using IdeaLauncher.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System;
using System.IO;
using System.Threading.Tasks;

namespace IdeaLauncher.Views;

public sealed partial class InstanceDetailPage : Page
{

    public InstanceItem SelectedItem = InstanceService.Current.SelectedInstance;

    public InstanceDetailPage()
    {
        InitializeComponent();

        // Subscribe to the log event when the page is loaded
        MinecraftService.Current.OnLogReceived += MinecraftService_OnLogReceived;

        this.Unloaded += (s, e) => {
            MinecraftService.Current.OnLogReceived -= MinecraftService_OnLogReceived;
        };
    }

    private void MinecraftService_OnLogReceived(string logLine)
    {
        this.DispatcherQueue.TryEnqueue(() =>
        {
            if (LogTextBox != null)
            {
                LogTextBox.Text += logLine;

                LogTextBox.Select(LogTextBox.Text.Length, 0);
            }
        });
    }

    private void GoBack_Click(object sender, RoutedEventArgs e)
    {
        this.Frame.GoBack();
    }

    private void LaunchGame_Click(object sender, RoutedEventArgs e)
    {
        LogTextBox.Text = "[SYSTEM] 正在準備啟動遊戲...\n";
        DetailSelectorBar.SelectedItem = LogsTab;
        Task.Run(async () =>
        {
            try
            {
                await MinecraftService.Current.LaunchMinecraft();
            }
            catch (Exception ex)
            {
                // 如果背景出錯，丟回 UI 執行緒列印
                this.DispatcherQueue.TryEnqueue(() =>
                {
                    LogTextBox.Text += $"\n[SYSTEM] 啟動器背景出錯: {ex.Message}\n";
                });
            }
        });
    }

    private void DetailSelectorBar_SelectionChanged(SelectorBar sender, SelectorBarSelectionChangedEventArgs args)
    {
        var selectedItem = sender.SelectedItem;

        // 先全部隱藏
        SettingsContent.Visibility = Visibility.Collapsed;
        ModsContent.Visibility = Visibility.Collapsed;
        LogsContent.Visibility = Visibility.Collapsed;

        // 根據選中的 Tab 顯示對應的內容
        if (selectedItem == SettingsTab) SettingsContent.Visibility = Visibility.Visible;
        else if (selectedItem == ModsTab) ModsContent.Visibility = Visibility.Visible;
        else if (selectedItem == LogsTab) LogsContent.Visibility = Visibility.Visible;
    }

    private async void OpenModsFolder_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedItem == null) return;

        string localFolder = Windows.Storage.ApplicationData.Current.LocalFolder.Path;
        string modsPath = Path.Combine(localFolder, "instances", SelectedItem.Name);

        // 如果資料夾還不存在就先建立
        if (!Directory.Exists(modsPath)) Directory.CreateDirectory(modsPath);

        // 打開 Windows 檔案總管
        var folder = await Windows.Storage.StorageFolder.GetFolderFromPathAsync(modsPath);
        await Windows.System.Launcher.LaunchFolderAsync(folder);
    }
}
