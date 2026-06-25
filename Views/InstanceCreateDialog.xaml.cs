using Microsoft.UI.Xaml.Controls;
using IdeaLauncher.Models;
using System.Threading.Tasks;
using System.Linq;

namespace IdeaLauncher.Views;

public sealed partial class InstanceCreateDialog : ContentDialog
{
    public InstanceCreateDialog()
    {
        InitializeComponent();

        LoaderBox.SelectedIndex = 0;

        _ = LoadVersionsAsync();
    }

    public string InstanceName =>
        NameBox.Text;

    public string Loader =>
        (LoaderBox.SelectedItem as ComboBoxItem)?.Content?.ToString()
        ?? "Vanilla";

    public int RamMb =>
        (int)RamBox.Value;

    public void LoadInstance(
        InstanceInfo instance)
    {
        NameBox.Text = instance.Name;
        RamBox.Value = instance.RamMb;
        VersionBox.SelectedItem = instance.MinecraftVersion;

        switch (instance.Loader) 
        {
            case "Fabric":
                LoaderBox.SelectedIndex = 1;
                break;

            case "Forge":
                LoaderBox.SelectedIndex = 2;
                break;

            default:
                LoaderBox.SelectedIndex = 0;
                break;
        }

    }

    public string MinecraftVersion =>
        VersionBox.SelectedItem?.ToString()
        ?? "latest";

    private async Task LoadVersionsAsync()
    {
        try
        {
            var manifest = await Services.MinecraftManifestService
                .GetManifestObjectAsync();
            if (manifest == null)
                return;
            VersionBox.ItemsSource = manifest.Versions
                .Select(v => v.Id)
                .ToList();

        }
        catch
        {
        }
    }
}