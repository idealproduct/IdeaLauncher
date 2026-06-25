using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace IdeaLauncher.Models;


public class VersionManifest
{
    [JsonPropertyName("versions")]
    public List<MinecraftVersionInfo>
        Versions { get; set; } = new();
}