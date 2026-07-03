using CmlLib.Core;
using CmlLib.Core.VersionMetadata;
using IdeaLauncher.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Foundation.Collections;
using Windows.System;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace IdeaLauncher.Views;

/// <summary>
/// An empty page that can be used on its own or navigated to within a Frame.
/// </summary>
public sealed partial class InstanceCreatePage : Page
{

    public ObservableCollection<string> MinecraftVersions { get; set; } = new ObservableCollection<string>();
    public InstanceCreatePage()
    {
        InitializeComponent();

        LoaderBox.SelectedIndex = 0;

        LoadAvailableVersions();

        VersionBox.SelectedItem = 0;
    }

    public string InstanceName =>
        NameBox.Text;

    public string Loader =>
        (LoaderBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Vanilla";

    public int RamMB =>
        (int)RamBox.Value;

    public void LoadInstance(
        InstanceInfo instance)
    {
        NameBox.Text = instance.Name;
        RamBox.Value = instance.RamMB;
        VersionBox.SelectedItem = instance.MinecraftVersion;

        switch (instance.Loader)
        {
            case "Fabric":
                LoaderBox.SelectedIndex = 1;
                break;

            case "Forge":
                LoaderBox.SelectedIndex = 2;
                break;

            case "NeoForge":
                LoaderBox.SelectedIndex = 3;
                break;

            default:
                LoaderBox.SelectedIndex = 4;
                break;
        }
    }

    public string MinecraftVersion =>
        VersionBox.SelectedItem?.ToString() ?? "latest";

    private void GoToMainPage_Click(object sender, RoutedEventArgs e)
    {
        this.Frame.GoBack();
    }

    private void CreateInstance_Click(object sender, RoutedEventArgs e)
    {

        if (string.IsNullOrWhiteSpace(InstanceName))
        {
            // 這裡可以加上提示訊息，例如：ContentDialog 或將 TextBox 的 Header 改成紅字
            return;
        }

        var instance = new InstanceInfo
        {
            Name =
                InstanceName,

            MinecraftVersion =
                MinecraftVersion,

            Loader =
                Loader,

            RamMB =
                RamMB,

        };

        SaveInstanceToFile(instance);

        this.Frame.Navigate(typeof(MainPage));
    }

    private void SaveInstanceToFile(InstanceInfo newInstance)
    {
        try
        {
            //(AppData/Local/Packages/你的應用程式ID/LocalState)
            string localFolder = Windows.Storage.ApplicationData.Current.LocalFolder.Path;
            string filePath = Path.Combine(localFolder, "instances.json");

            List<InstanceInfo> instanceList;
            if (File.Exists(filePath))
            {
                string existingJson = File.ReadAllText(filePath);
                instanceList = JsonSerializer.Deserialize<List<InstanceInfo>>(existingJson) ?? new List<InstanceInfo>();
            }
            else
            {
                instanceList = new List<InstanceInfo>();
            }
            instanceList.Add(newInstance);
            var options = new JsonSerializerOptions { WriteIndented = true };
            string updatedJson = JsonSerializer.Serialize(instanceList, options);

            File.WriteAllText(filePath, updatedJson);



            System.Diagnostics.Debug.WriteLine($"實例已成功儲存至: {filePath}");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"儲存檔案時發生錯誤: {ex.Message}");
        }
    }

    public async Task LoadAvailableVersions()
    {
        var launcher = new MinecraftLauncher();
        VersionMetadataCollection versions = await launcher.GetAllVersionsAsync();

        foreach (var version in versions)
        {
            MinecraftVersions.Add(version.Name);
        }
    }
}

