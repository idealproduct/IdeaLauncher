using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json;
using System.Net.Http;
using IdeaLauncher.Models;

namespace IdeaLauncher.Services;

public static class MinecraftManifestService
{
    private const string ManifestUrl =
        "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

    public static async Task<string> GetManifestAsync()
    {
        using HttpClient client = new();

        return await client.GetStringAsync(
            ManifestUrl);
    }

    public static async Task<VersionManifest?>
        GetManifestObjectAsync()
    {
        string json = await GetManifestAsync();

        return JsonSerializer.Deserialize<VersionManifest>(json);
    }
}