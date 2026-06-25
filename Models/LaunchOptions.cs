using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IdeaLauncher.Models;

public class LaunchOptions
{
    public string PlayerName { get; set; }
        = "Player";

    public string VersionId { get; set; }
        = "";

    public string GameDirectory { get; set; }
        = "";

    public string AssetsDirectory { get; set; }
        = "";

    public string AssetsIndex { get; set; }
        = "";

    public string JavaPath { get; set; }
    = "";

    public string Classpath { get; set; }
        = "";

    public string MainClass { get; set; }
        = "";

    public int MaxMemoryMb
    {
        get;
        set;
    } = 4096;

    public string Uuid
    {
        get;
        set;
    } =
    Guid.NewGuid()
        .ToString("N");

    public string AccessToken
    {
        get;
        set;
    } = "0";
}