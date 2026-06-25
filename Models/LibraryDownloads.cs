using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Serialization;

namespace IdeaLauncher.Models;

public class LibraryDownloads
{
    [JsonPropertyName("artifact")]
    public LibraryArtifact? Artifact
    {
        get;
        set;
    }

    [JsonPropertyName("classifiers")]
    public LibraryClassifiers? Classifiers
    {
        get;
        set;
    }
}