using IdeaLauncher.Models;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class SettingsService
{
    private static string SettingsFile =>
        Path.Combine(
            LauncherPaths.Root,
            "settings.json");

    public static async Task<LauncherSettings>
        LoadAsync()
    {
        if (!File.Exists(SettingsFile))
        {
            return new LauncherSettings();
        }

        string json =
            await File.ReadAllTextAsync(
                SettingsFile);

        return JsonSerializer.Deserialize<LauncherSettings>(
                   json)
               ?? new LauncherSettings();
    }

    public static async Task SaveAsync(
        LauncherSettings settings)
    {
        string json =
            JsonSerializer.Serialize(
                settings,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                });

        await File.WriteAllTextAsync(
            SettingsFile,
            json);
    }
}