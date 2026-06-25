using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class LibraryInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("downloads")]
    public LibraryDownloads? Downloads { get; set; }
}