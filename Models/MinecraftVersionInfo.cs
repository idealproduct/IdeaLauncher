using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace IdeaLauncher.Models;

public class MinecraftVersionInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";

    [JsonPropertyName("releaseTime")]
    public string ReleaseTime { get; set; } = "";

}
