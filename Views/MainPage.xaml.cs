using IdeaLauncher.Models;
using IdeaLauncher.Services;
using IdeaLauncher.Views;
using Microsoft.UI.Xaml.Controls;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace IdeaLauncher.Views
{
    public sealed partial class MainPage : Page
    {
        // 使用 ObservableCollection 確保資料變動時 UI 會跟著變
        public ObservableCollection<InstanceItem> Instances { get; set; } = new ObservableCollection<InstanceItem>();

        public MainPage()
        {
            InitializeComponent();

            // 模擬從檔案或資料庫讀取出來的實例資料
            LoadInstances();

            // Bind item Source to GridView 
            InstanceGridView.ItemsSource = Instances;


        }

        private void LoadInstances()
        {
            //Instances.Add(new InstanceItem { Name = "Nomifactory CEu", Author = "tracer4b", Version = "1.7.7", ImagePath = "ms-appx:///Assets/nomi.png" });
            //Instances.Add(new InstanceItem { Name = "Infinity Legacy II", Author = "WesleyJBA", Version = "3.7", ImagePath = "ms-appx:///Assets/infinity.png" });
            //Instances.Add(new InstanceItem { Name = "Multiblock Madness 2", Author = "Filostorm", Version = "1.0.0", ImagePath = "ms-appx:///Assets/mm2.png" });
            //// ... For example


            Instances.Clear(); // 先清空舊資料

            string localFolder = Windows.Storage.ApplicationData.Current.LocalFolder.Path;
            string filePath = Path.Combine(localFolder, "instances.json");

            if (File.Exists(filePath))
            {
                try
                {
                    string json = File.ReadAllText(filePath);
                    var list = JsonSerializer.Deserialize<List<InstanceItem>>(json);

                    if (list != null)
                    {
                        foreach (var item in list)
                        {
                            // 補上預設的圖片路徑，因為創建時只填了文字資料
                            if (string.IsNullOrEmpty(item.ImagePath))
                            {
                                item.ImagePath = "ms-appx:///Assets/logo_expert.png"; // 預設封面的路徑
                            }

                            if (string.IsNullOrEmpty(item.Author))
                            {
                                item.Author = "Unknow";
                            }
                            Instances.Add(item);
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"載入檔案失敗: {ex.Message}");
                }
            }
        }
        

        // Click a Card
        private void InstanceGridView_ItemClick(object sender, ItemClickEventArgs e)
        {
            var clickedItem = e.ClickedItem as InstanceItem;
            // Go to the Instance Detail page
            // this.Frame.Navigate(typeof(InstanceDetailPage), clickedItem);
        }

        private void CreateInstance_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            this.Frame.Navigate(typeof(InstanceCreatePage));
        }

        private void Back_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            this.Frame.GoBack();
        }

        private async void InstanceGridView_DoubleTapped(object sender, Microsoft.UI.Xaml.Input.DoubleTappedRoutedEventArgs e)
        {

            // 1. 從發送端（GridView）取得目前被選取的項目
            if (sender is GridView gridView && gridView.SelectedItem is InstanceItem selectedItem)
            {
                // 2. 💡 關鍵：把選中的項目塞給全域服務，這樣 MinecraftService 才讀得到資料！
                // 如果你的 Service 裡是用 InstanceInfo，記得在這裡做轉換
                InstanceService.Current.SelectedInstance = selectedItem;

                try
                {
                    // 3. 確保 SelectedInstance 不是 null 後，再執行啟動
                    var MinecraftService = new MinecraftService();

                    await MinecraftService.LaunchMinecraft();
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"啟動失敗: {ex.Message}");
                }
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("⚠️ 無法啟動：尚未選取任何實例或連點位置不正確。");
            }

        }
    }
}