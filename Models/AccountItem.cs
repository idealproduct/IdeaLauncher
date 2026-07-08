using CmlLib.Core.Auth.Microsoft.Sessions;
using XboxAuthNet.Game.Accounts;

namespace IdeaLauncher.Models;

public class AccountItem
{
    public string Name { get; set; } = string.Empty;

    public JEGameAccount? XboxAccount { get; set; }

    public bool IsActionButton { get; set; } = false;

    public string clientId { get; set; } = string.Empty;
}