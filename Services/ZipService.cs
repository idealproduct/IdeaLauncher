using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class ZipService
{
    public static void Extract(
        string zipFile,
        string outputFolder)
    {
        if (Directory.Exists(outputFolder))
        {
            Directory.Delete(
                outputFolder,
                true);
        }

        ZipFile.ExtractToDirectory(
            zipFile,
            outputFolder);
    }
}
