using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class JavaService
{
    public static async Task<string> GetJavaVersionAsync(
        string javaPath)
    {
        if (!File.Exists(javaPath))
            return "Java not found";

        ProcessStartInfo startInfo = new()
        {
            FileName = javaPath,
            Arguments = "-version",
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using Process process = new()
        {
            StartInfo = startInfo
        };

        process.Start();

        string output =
            await process.StandardError.ReadToEndAsync();

        await process.WaitForExitAsync();

        return output;
    }

    public static string GetJavaExecutable()
    {
        var folders =
            Directory.GetDirectories(
                LauncherPaths.Java,
                "jdk-*");

        if (folders.Length == 0)
            return "";

        return Path.Combine(
            folders[0],
            "bin",
            "javaw.exe");
    }


    public static string GetJavaExe()
    {
        var folders =
            Directory.GetDirectories(
                LauncherPaths.Java,
                "jdk-*");

        if (folders.Length == 0)
            return "";

        return Path.Combine(
            folders[0],
            "bin",
            "javaw.exe");
    }

    public static bool IsJavaInstalled()
    {
        return File.Exists(
            GetJavaExe());
    }

    public static async Task DownloadJavaAsync()
    {
        string zipFile =
            Path.Combine(
                LauncherPaths.Java,
                "java.zip");

        string url =
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jdk_x64_windows_hotspot_21.0.9_10.zip";

        await DownloadService
            .DownloadFileAsync(
                url,
                zipFile);
    }

    public static void ExtractJava()
    {
        string zipFile =
            Path.Combine(
                LauncherPaths.Java,
                "java.zip");

        string extractFolder =
            LauncherPaths.Java;

        if (!File.Exists(zipFile))
            return;

        ZipFile.ExtractToDirectory(
            zipFile,
            extractFolder,
            true);
    }

    public static string GetJavaVersion()
    {
        string javaExe =
            GetJavaExe();

        if (!File.Exists(javaExe))
            return "Java Not Found";

        ProcessStartInfo psi =
            new()
            {
                FileName = javaExe,
                Arguments = "-version",
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

        using Process process =
            Process.Start(psi)!;

        string output =
            process.StandardError.ReadToEnd();

        process.WaitForExit();

        return output;
    }
}