using IdeaLauncher.Models;
using IdeaLauncher.Views;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
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

namespace IdeaLauncher
{
    /// <summary>
    /// An empty window that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void InstanceList_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
        {

        }

        private void InstanceList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {

        }

        private async void CreateInstance_Click(object sender, RoutedEventArgs e)
        {
            var page = new InstanceCreatePage();

            page.XamlRoot = Content.XamlRoot;

            //var result = await page.;

            //if (result != ContentDialogResult.Primary)
            //{
            //    return;
            //}

            if (string.IsNullOrWhiteSpace(page.InstanceName))
                return;

            var instance = new InstanceInfo
            {
                Name =
                    page.InstanceName,

                MinecraftVersion =
                    page.MinecraftVersion,

                Loader =
                    page.Loader,

                RamMB =
                    page.RamMB,

            };
        }
    }
}

