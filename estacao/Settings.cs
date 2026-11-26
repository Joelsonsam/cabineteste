using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace Cabine.Estacao
{
    public sealed class Settings
    {
        public string PrinterFoto = "";
        public string PrinterTirinha = "";
        public int RollSize = 700;
        public int Remaining = 700;
        public bool KeepCopies = true;
        public int PrintedTotal;

        static string Dir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CabineMude");
        static string FilePath => Path.Combine(Dir, "estacao.ini");

        public static string CopiesDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Cabine Mude", "Impressões", DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));

        public static Settings Load()
        {
            var s = new Settings();
            try
            {
                if (!File.Exists(FilePath)) return s;
                var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var line in File.ReadAllLines(FilePath, Encoding.UTF8))
                {
                    int e = line.IndexOf('=');
                    if (e > 0) map[line.Substring(0, e).Trim()] = line.Substring(e + 1).Trim();
                }
                if (map.TryGetValue("impressora_foto", out var a)) s.PrinterFoto = a;
                if (map.TryGetValue("impressora_tirinha", out var b)) s.PrinterTirinha = b;
                if (map.TryGetValue("rolo", out var c) && int.TryParse(c, out var ci) && ci > 0) s.RollSize = ci;
                if (map.TryGetValue("restantes", out var d) && int.TryParse(d, out var di)) s.Remaining = di;
                if (map.TryGetValue("guardar_copias", out var f)) s.KeepCopies = f != "0";
                if (map.TryGetValue("total", out var g) && int.TryParse(g, out var gi)) s.PrintedTotal = gi;
            }
            catch { }
            return s;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                File.WriteAllLines(FilePath, new[]
                {
                    "impressora_foto=" + PrinterFoto,
                    "impressora_tirinha=" + PrinterTirinha,
                    "rolo=" + RollSize.ToString(CultureInfo.InvariantCulture),
                    "restantes=" + Remaining.ToString(CultureInfo.InvariantCulture),
                    "guardar_copias=" + (KeepCopies ? "1" : "0"),
                    "total=" + PrintedTotal.ToString(CultureInfo.InvariantCulture),
                }, Encoding.UTF8);
            }
            catch { }
        }
    }
}
