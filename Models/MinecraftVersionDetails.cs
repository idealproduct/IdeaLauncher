using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class MinecraftVersionDetails
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("downloads")]
    public DownloadsInfo Downloads
    { get; set; } = new();

    [JsonPropertyName("libraries")]
    public List<LibraryInfo>
    Libraries
    { get; set; } = new();

    [JsonPropertyName("assetIndex")]
    public AssetIndexInfo AssetIndex
    { get; set; } = new();

    [JsonPropertyName("mainClass")]
    public string MainClass { get; set; } = "";

    [JsonPropertyName("javaVersion")]
    public JavaVersionInfo JavaVersion
    { get; set; } = new();

    [JsonPropertyName("arguments")]
    public ArgumentsInfo Arguments
    { get; set; } = new();
}