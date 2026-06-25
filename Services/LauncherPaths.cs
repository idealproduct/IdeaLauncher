using System;
using System.IO;

namespace IdeaLauncher.Services;

public static class LauncherPaths
{
    public static string Root =>
        Path.Combine(
            AppContext.BaseDirectory,
            "LauncherData");

    public static string Instances =>
        Path.Combine(Root, "instances");

    public static string Shared =>
        Path.Combine(Root, "shared");

    public static string Runtimes =>
    Path.Combine(
        Root,
        "runtimes");

    public static string Downloads =>
    Path.Combine(
        Root,
        "downloads");

    public static string Versions =>
        Path.Combine(
            Shared,
            "versions");

    public static string Libraries =>
    Path.Combine(
        Shared,
        "libraries");

    public static string Assets =>
    Path.Combine(
        Shared,
        "assets");

    public static string Java =>
    Path.Combine(
        Root,
        "java");

    public static string GetVersionNatives(
    string versionId)
    {
        return Path.Combine(
            Versions,
            versionId,
            "natives");
    }

    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(Instances);
        Directory.CreateDirectory(Shared);
        Directory.CreateDirectory(Runtimes);
        Directory.CreateDirectory(Downloads);
        Directory.CreateDirectory(Versions);
        Directory.CreateDirectory(Libraries);
        Directory.CreateDirectory(Assets);
        Directory.CreateDirectory(Java);
    }
}