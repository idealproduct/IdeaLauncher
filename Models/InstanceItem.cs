using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IdeaLauncher.Models
{
    public class InstanceItem
    {
        public string? Name { get; set; }
        public string? Author { get; set; }
        public string? MinecraftVersion { get; set; }
        public string? ImagePath { get; set; }
        public string? Loader { get; set; } = "Vanilla";
        public int RamMB { get; set; } = 4096;
    }
}
