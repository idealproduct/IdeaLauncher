using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class LibraryArtifact
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";
}