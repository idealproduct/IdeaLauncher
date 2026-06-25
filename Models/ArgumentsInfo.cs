using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

public class ArgumentsInfo
{
    [JsonPropertyName("game")]
    public List<JsonElement> Game
    { get; set; } = new();

    [JsonPropertyName("jvm")]
    public List<JsonElement> Jvm
    { get; set; } = new();
}