using IdeaLauncher.Models;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class InstanceService
{
    public static async Task CreateInstanceAsync(
        InstanceInfo instance)
    {
        string folder =
            Path.Combine(
                LauncherPaths.Instances,
                instance.Name);

        Directory.CreateDirectory(folder);

        Directory.CreateDirectory(
            Path.Combine(folder, "mods"));

        Directory.CreateDirectory(
            Path.Combine(folder, "saves"));

        Directory.CreateDirectory(
            Path.Combine(folder, "resourcepacks"));

        string json =
            JsonSerializer.Serialize(
                instance,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                });

        await File.WriteAllTextAsync(
            Path.Combine(folder, "instance.json"),
            json);
    }

    public static List<InstanceInfo> GetInstances()
    {
        List<InstanceInfo> result = new();

        if (!Directory.Exists(
            LauncherPaths.Instances))
        {
            return result;
        }

        foreach (string folder in
                 Directory.GetDirectories(
                     LauncherPaths.Instances))
        {
            string jsonFile =
                Path.Combine(
                    folder,
                    "instance.json");

            if (!File.Exists(jsonFile))
                continue;

            string json =
                File.ReadAllText(jsonFile);

            InstanceInfo? instance =
                JsonSerializer.Deserialize<InstanceInfo>(
                    json);

            if (instance != null)
                result.Add(instance);
        }

        return result;
    }

    public static async Task SaveInstanceAsync(
    InstanceInfo instance)
    {
        string folder =
            Path.Combine(
                LauncherPaths.Instances,
                instance.Name);

        string json =
            JsonSerializer.Serialize(
                instance,
                new JsonSerializerOptions
                {
                    WriteIndented = true
                });

        await File.WriteAllTextAsync(
            Path.Combine(
                folder,
                "instance.json"),
            json);
    }

    public static void RenameInstance(
    string oldName,
    string newName)
    {
        string oldFolder =
            Path.Combine(
                LauncherPaths.Instances,
                oldName);

        string newFolder =
            Path.Combine(
                LauncherPaths.Instances,
                newName);

        if (Directory.Exists(oldFolder))
        {
            Directory.Move(
                oldFolder,
                newFolder);
        }
    }

    public static void DeleteInstance(
        string instanceName)
    {
        string folder =
            Path.Combine(
                LauncherPaths.Instances,
                instanceName);

        if (Directory.Exists(folder))
        {
            Directory.Delete(
                folder,
                true);
        }
    }
}