using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.IO;
using System.Management;

namespace Cabine.Estacao
{
    public sealed class WindowsPrinter : IPrinterBackend
    {
        readonly Settings settings;

        public WindowsPrinter(Settings settings) { this.settings = settings; }

        public static List<string> Installed()
        {
            var list = new List<string>();
            foreach (string p in PrinterSettings.InstalledPrinters) list.Add(p);
            list.Sort(StringComparer.CurrentCultureIgnoreCase);
            return list;
        }

        public string PrinterFor(string profile)
        {
            if (profile == "tirinha" && !string.IsNullOrEmpty(settings.PrinterTirinha)) return settings.PrinterTirinha;
            return settings.PrinterFoto;
        }

        public bool IsOnline(string profile)
        {
            string name = PrinterFor(profile);
            if (string.IsNullOrEmpty(name)) return false;
            try
            {
                string safe = name.Replace("\\", "\\\\").Replace("'", "\\'");
                using (var search = new ManagementObjectSearcher("SELECT WorkOffline, PrinterStatus FROM Win32_Printer WHERE Name = '" + safe + "'"))
                {
                    foreach (ManagementObject o in search.Get())
                    {
                        bool offline = o["WorkOffline"] is bool b && b;
                        return !offline;
                    }
                }
                return false;
            }
            catch
            {
                return true;
            }
        }

        public void Print(PrintJobItem job)
        {
            string printer = PrinterFor(job.Profile);
            if (string.IsNullOrEmpty(printer)) throw new InvalidOperationException("Nenhuma impressora escolhida na estação");

            using (var ms = new MemoryStream(job.Data))
            using (var img = Image.FromStream(ms))
            {
                if (settings.KeepCopies) SaveCopy(job);
                PrintImage(img, printer, job.Name);
            }
        }

        static void SaveCopy(PrintJobItem job)
        {
            try
            {
                var dir = Settings.CopiesDir;
                Directory.CreateDirectory(dir);
                string ext = job.Data.Length > 1 && job.Data[0] == 0x89 ? ".png" : ".jpg";
                string baseName = Path.GetFileNameWithoutExtension(string.Join("_", job.Name.Split(Path.GetInvalidFileNameChars())));
                string path = Path.Combine(dir, baseName + ext);
                int n = 2;
                while (File.Exists(path)) path = Path.Combine(dir, baseName + "-" + n++ + ext);
                File.WriteAllBytes(path, job.Data);
            }
            catch { }
        }

        public static void PrintImage(Image img, string printer, string docName)
        {
            using (var doc = new PrintDocument())
            {
                doc.PrinterSettings.PrinterName = printer;
                if (!doc.PrinterSettings.IsValid) throw new InvalidOperationException("Impressora não encontrada: " + printer);
                doc.DocumentName = docName;
                doc.PrintController = new StandardPrintController();
                doc.OriginAtMargins = false;

                var page = doc.DefaultPageSettings;
                page.Margins = new Margins(0, 0, 0, 0);
                var paper = Pick4x6(doc.PrinterSettings);
                if (paper != null) page.PaperSize = paper;
                page.Landscape = img.Width > img.Height;

                doc.PrintPage += (s, e) =>
                {
                    var g = e.Graphics;
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    RectangleF bounds = e.PageBounds;
                    float hx = e.PageSettings.HardMarginX;
                    float hy = e.PageSettings.HardMarginY;
                    float k = Math.Max(bounds.Width / img.Width, bounds.Height / img.Height);
                    float w = img.Width * k;
                    float h = img.Height * k;
                    g.DrawImage(img, -hx + (bounds.Width - w) / 2f, -hy + (bounds.Height - h) / 2f, w, h);
                    e.HasMorePages = false;
                };
                doc.Print();
            }
        }

        static PaperSize Pick4x6(PrinterSettings ps)
        {
            PaperSize byName = null;
            foreach (PaperSize p in ps.PaperSizes)
            {
                int a = Math.Min(p.Width, p.Height);
                int b = Math.Max(p.Width, p.Height);
                if (Math.Abs(a - 400) <= 15 && Math.Abs(b - 600) <= 20) return p;
                string n = (p.PaperName ?? "").ToUpperInvariant().Replace(" ", "");
                if (byName == null && (n.Contains("4X6") || n.StartsWith("PR(") || n.Contains("10X15"))) byName = p;
            }
            return byName;
        }

        public static Bitmap TestSheet(string profile)
        {
            const int W = 1200, H = 1800;
            var bmp = new Bitmap(W, H);
            bmp.SetResolution(300, 300);
            using (var g = Graphics.FromImage(bmp))
            using (var ink = new SolidBrush(Color.FromArgb(70, 40, 130)))
            using (var gold = new SolidBrush(Color.FromArgb(219, 150, 0)))
            using (var pen = new Pen(Color.FromArgb(70, 40, 130), 6))
            using (var big = new Font("Segoe UI", 34, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var mid = new Font("Segoe UI", 26, FontStyle.Regular, GraphicsUnit.Pixel))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.White);
                bool strip = profile == "tirinha";
                int cols = strip ? 2 : 1;
                int cw = W / cols;
                for (int c = 0; c < cols; c++)
                {
                    int x0 = c * cw;
                    g.FillRectangle(ink, x0 + 40, 40, cw - 80, H - 380);
                    g.DrawRectangle(pen, x0 + 20, 20, cw - 40, H - 40);
                    var fmt = new StringFormat { Alignment = StringAlignment.Center };
                    g.DrawString(strip ? "Tirinha 5x15" : "Foto 10x15", big, gold, new RectangleF(x0, H - 300, cw, 60), fmt);
                    g.DrawString("Teste da estação", mid, ink, new RectangleF(x0, H - 220, cw, 50), fmt);
                    g.DrawString(DateTime.Now.ToString("dd/MM/yyyy HH:mm"), mid, ink, new RectangleF(x0, H - 170, cw, 50), fmt);
                }
                if (strip)
                {
                    using (var dash = new Pen(Color.FromArgb(219, 150, 0), 3) { DashStyle = DashStyle.Dash })
                        g.DrawLine(dash, W / 2, 0, W / 2, H);
                }
            }
            return bmp;
        }
    }
}
