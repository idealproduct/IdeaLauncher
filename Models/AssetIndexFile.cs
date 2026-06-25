using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class AssetIndexFile
{
    [JsonPropertyName("objects")]
    public Dictionary<string, AssetObject>
        Objects
    { get; set; } = new();
}