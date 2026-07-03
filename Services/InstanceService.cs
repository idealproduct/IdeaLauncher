using IdeaLauncher.Models;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Windows.Storage;

namespace IdeaLauncher.Services
{
    public class InstanceService
    {
        // 1. 單例模式：讓全程式都存取同一個 Service 實例
        public static InstanceService Current { get; } = new InstanceService();

        // 2. 記憶體中的實例清單 (供 UI 綁定)
        public ObservableCollection<InstanceItem> Instances { get; set; } = new ObservableCollection<InstanceItem>();

        // 3. 紀錄「目前選取的實例」
        public InstanceItem SelectedInstance { get; set; }

        // JSON 檔案儲存路徑 (通常放在 AppData/Local/專案名稱 下)
        private readonly string _filePath = Path.Combine(ApplicationData.Current.LocalFolder.Path, "instances.json");
        private InstanceService() => LoadFromFile(); // 初始化時自動讀取舊資料

        // 從檔案載入資料
        public void LoadFromFile()
        {
            if (!File.Exists(_filePath)) return;

            try
            {
                string json = File.ReadAllText(_filePath);
                var list = JsonSerializer.Deserialize<ObservableCollection<InstanceItem>>(json);
                if (list != null)
                {
                    Instances = list;
                }
            }
            catch (Exception ex)
            {
                // 處理讀取錯誤 (例如 JSON 格式損壞)
                System.Diagnostics.Debug.WriteLine($"載入失敗: {ex.Message}");
            }
        }

        // 儲存資料到檔案
        public void SaveToFile()
        {
            try
            {
                string json = JsonSerializer.Serialize(Instances, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"儲存失敗: {ex.Message}");
            }
        }
    }
}
