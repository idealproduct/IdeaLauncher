using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using IdeaLauncher.Models;

namespace IdeaLauncher.Services;

public static class InstanceInstallService
{
    public static async Task InstallAsync(
        InstanceInfo instance)
    {
        string versionId =
            instance.MinecraftVersion;

        //await MinecraftVersionService
        //    .DownloadClientJarAsync(
        //        versionId);

        //await MinecraftVersionService
        //    .DownloadLibrariesAsync(
        //        versionId);

        //await MinecraftVersionService
        //    .DownloadAssetIndexAsync(
        //    versionId);

        await MinecraftVersionService
            .InstallMinecraftAsync(
            versionId);

        //await MinecraftVersionService
        //    .DownloadAssetsAsync(
        //        versionId);

        await MinecraftVersionService
            .ExtractNativesAsync(
                versionId);
    }
}