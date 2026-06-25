namespace IdeaLauncher.Models;

public class InstanceInfo
{
    public string Name { get; set; } = "";

    public string MinecraftVersion { get; set; } = "";

    public string Loader { get; set; } = "Vanilla";

    public int RamMb { get; set; } = 4096;

    public override string ToString()
    {
        return Name;
    }

    public string GameDirectory
    {
        get;
        set;
    } = "";
}