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
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace IdeaLauncher.Views;

/// <summary>
/// An empty page that can be used on its own or navigated to within a Frame.
/// </summary>
public sealed partial class InstanceCreatePage : Page
{
    public InstanceCreatePage()
    {
        InitializeComponent();

        LoaderBox.SelectedIndex = 0;
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
}
