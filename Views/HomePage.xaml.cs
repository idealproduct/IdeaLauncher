using CmlLib.Core.Auth.Microsoft;
using CmlLib.Core.Auth.Microsoft.Sessions;
using IdeaLauncher.Models;
using IdeaLauncher.Services;
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
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Foundation.Collections;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace IdeaLauncher.Views
{
    /// <summary>
    /// An empty page that can be used on its own or navigated to within a Frame.
    /// </summary>
    /// 

    public sealed partial class HomePage : Page
    {
        public ObservableCollection<string> AccountList { get; set; } = new ObservableCollection<string>();

        public JELoginHandler loginHandler { get; set; } = JELoginHandlerBuilder.BuildDefault();

        private MinecraftService _currentSession;
        public HomePage()
        {
            InitializeComponent();

            LoadAccounts();
        }

        private void InstanceManage_Click(object sender, RoutedEventArgs e)
        {
            this.Frame.Navigate(typeof(MainPage));
        }

        private void Setting_Click(object sender, RoutedEventArgs e)
        {

        }


        private void LoadAccounts()
        {
            loginHandler = JELoginHandlerBuilder.BuildDefault();
            var accounts = loginHandler.AccountManager.GetAccounts();
            if (accounts != null) {
                    foreach (var account in accounts)
                    {
                        if (account is not JEGameAccount jeAccount)
                            continue;
                        AccountList.Add(jeAccount.Profile?.Username);
                    }
            }
            var session = loginHandler.AuthenticateSilently();
        }

        private async void AddAccount_Click(object sender, RoutedEventArgs e)
        {
            var clientId = "f930789e-31a6-4b74-9ef3-cb3939f7f0dd"; // Replace with your actual client ID
            var addAccount = new AuthService(clientId);
            await addAccount.AuthLogin();
            LoadAccounts();
        }

        private async void AccountListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var accounts = loginHandler.AccountManager.GetAccounts();
            if (accounts.Count != 0 && accounts != null)
            {
                string SelectedAccountName = AccountListBox.SelectedItem.ToString()!;
                var selectedAccount = accounts.GetJEAccountByUsername(SelectedAccountName);
                var session = await loginHandler.Authenticate(selectedAccount);
                MinecraftService.Current.CurrentSession = session;
            }
        }
    }
}
