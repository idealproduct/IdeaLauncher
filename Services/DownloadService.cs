using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace IdeaLauncher.Services;

public static class DownloadService
{
    public static async Task DownloadFileAsync(
        string url,
        string outputFile)
    {
        using HttpClient client = new();

        byte[] data =
            await client.GetByteArrayAsync(url);

        await File.WriteAllBytesAsync(
            outputFile,
            data);
    }

    public static async Task DownloadFileWithProgressAsync(
        string url,
        string outputFile,
        Action<double>? progressCallback = null)
    {
        using HttpClient client = new();

        using HttpResponseMessage response =
            await client.GetAsync(
                url,
                HttpCompletionOption.ResponseHeadersRead);

        response.EnsureSuccessStatusCode();

        long? totalBytes =
            response.Content.Headers.ContentLength;

        using Stream contentStream =
            await response.Content.ReadAsStreamAsync();

        using FileStream fileStream =
            new(
                outputFile,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None);

        byte[] buffer = new byte[8192];

        long totalRead = 0;

        int bytesRead;

        while ((bytesRead =
                await contentStream.ReadAsync(
                    buffer,
                    0,
                    buffer.Length)) > 0)
        {
            await fileStream.WriteAsync(
                buffer,
                0,
                bytesRead);

            totalRead += bytesRead;

            if (totalBytes.HasValue)
            {
                double percent =
                    (double)totalRead /
                    totalBytes.Value * 100;

                progressCallback?.Invoke(
                    percent);
            }
        }
    }
}