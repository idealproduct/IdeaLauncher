using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class ClientDownloadInfo
{
    [JsonPropertyName("url")]
    public string Url { get; set; } = "";

    [JsonPropertyName("sha1")]
    public string Sha1 { get; set; } = "";

    [JsonPropertyName("size")]
    public long Size { get; set; }
}