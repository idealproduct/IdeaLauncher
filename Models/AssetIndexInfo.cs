using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class AssetIndexInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";
}