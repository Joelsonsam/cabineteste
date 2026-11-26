using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Windows.Forms;

namespace Cabine.Estacao
{
    public sealed class MainForm : Form
    {
        static readonly Color Purple = Color.FromArgb(70, 40, 130);
        static readonly Color Gold = Color.FromArgb(219, 150, 0);
        static readonly Color Ink = Color.FromArgb(28, 28, 32);
        static readonly Color Muted = Color.FromArgb(110, 110, 118);
        static readonly Color Line = Color.FromArgb(226, 224, 232);
        static readonly Color Ok = Color.FromArgb(22, 140, 80);
        static readonly Color Bad = Color.FromArgb(200, 50, 40);

        readonly Settings settings = Settings.Load();
        readonly WindowsPrinter backend;
        PrintServer server;

        readonly Label address = new Label();
        readonly Label status = new Label();
        readonly ComboBox printerFoto = new ComboBox();
        readonly ComboBox printerTirinha = new ComboBox();
        readonly Label paperText = new Label();
        readonly ProgressBar paperBar = new ProgressBar();
        readonly NumericUpDown rollSize = new NumericUpDown();
        readonly CheckBox paused = new CheckBox();
        readonly CheckBox keepCopies = new CheckBox();
        readonly ListBox log = new ListBox();
        readonly Label footer = new Label();
        readonly Timer tick = new Timer();
        string lastError = "";

        public MainForm()
        {
            backend = new WindowsPrinter(settings);
            Text = "Estação de impressão - Cabine Mude!";
            Font = new Font("Segoe UI", 10f);
            BackColor = Color.White;
            ForeColor = Ink;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(620, 720);
            Size = new Size(680, 820);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            BuildUi();
            LoadPrinters();
            UpdatePaper();
            StartServer();

            tick.Interval = 5000;
            tick.Tick += (s, e) => { RefreshAddress(); RefreshStatus(); };
            tick.Start();
        }

        void BuildUi()
        {
            var header = new Panel { Dock = DockStyle.Top, Height = 92, BackColor = Purple, Padding = new Padding(24, 16, 24, 12) };
            var title = new Label { Text = "Estação de impressão", ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 20f), AutoSize = true, Location = new Point(22, 14) };
            var sub = new Label { Text = "Recebe as fotos do totem e dos celulares pela rede e manda para a impressora.", ForeColor = Color.FromArgb(230, 222, 245), AutoSize = true, Location = new Point(26, 56) };
            header.Controls.Add(title);
            header.Controls.Add(sub);

            var body = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                Padding = new Padding(24, 16, 24, 8),
                AutoScroll = true,
            };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            body.Controls.Add(Caption("Endereço para o totem e os celulares"));
            address.Font = new Font("Consolas", 22f, FontStyle.Bold);
            address.ForeColor = Purple;
            address.AutoSize = true;
            address.Margin = new Padding(0, 2, 0, 0);
            address.Cursor = Cursors.Hand;
            address.Click += (s, e) =>
            {
                var first = address.Text.Split('\n').FirstOrDefault()?.Trim();
                if (!string.IsNullOrEmpty(first)) { Clipboard.SetText(first); Note("Endereço copiado: " + first); }
            };
            body.Controls.Add(address);
            body.Controls.Add(Hint("No app, abra Ajustes > Estação de impressão e digite esse endereço. Totem e notebook precisam estar na mesma rede."));

            status.AutoSize = true;
            status.Font = new Font("Segoe UI Semibold", 11f);
            status.Margin = new Padding(0, 10, 0, 6);
            body.Controls.Add(status);

            body.Controls.Add(Rule());
            body.Controls.Add(Caption("Impressoras"));
            body.Controls.Add(PrinterRow("Foto 10x15, polaroid e digitais", printerFoto, "foto"));
            body.Controls.Add(PrinterRow("Tirinha, com corte automático", printerTirinha, "tirinha"));
            body.Controls.Add(Hint("DNP DS-RX1HS: para a tirinha sair cortada, crie uma cópia da impressora no Windows com \"2 inch cut\" ativado nas Preferências de impressão e escolha essa cópia aqui."));

            body.Controls.Add(Rule());
            body.Controls.Add(Caption("Papel"));
            paperText.AutoSize = true;
            paperText.Font = new Font("Segoe UI Semibold", 12f);
            body.Controls.Add(paperText);
            paperBar.Height = 10;
            paperBar.Dock = DockStyle.Top;
            paperBar.Margin = new Padding(0, 4, 0, 6);
            body.Controls.Add(paperBar);

            var paperRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
            var reset = Button("Troquei o rolo");
            reset.Click += (s, e) => { settings.Remaining = settings.RollSize; settings.Save(); UpdatePaper(); Note("Contador de papel zerado: " + settings.RollSize + " folhas."); };
            paperRow.Controls.Add(reset);
            paperRow.Controls.Add(new Label { Text = "Folhas por rolo", AutoSize = true, Margin = new Padding(16, 9, 6, 0), ForeColor = Muted });
            rollSize.Minimum = 10;
            rollSize.Maximum = 5000;
            rollSize.Value = Math.Max(10, Math.Min(5000, settings.RollSize));
            rollSize.Width = 80;
            rollSize.Margin = new Padding(0, 6, 0, 0);
            rollSize.ValueChanged += (s, e) => { settings.RollSize = (int)rollSize.Value; settings.Save(); UpdatePaper(); };
            paperRow.Controls.Add(rollSize);
            body.Controls.Add(paperRow);

            body.Controls.Add(Rule());
            paused.Text = "Pausar impressões (os pedidos ficam na fila)";
            paused.AutoSize = true;
            paused.CheckedChanged += (s, e) =>
            {
                if (server == null) return;
                server.Paused = paused.Checked;
                if (!paused.Checked) server.Resume();
                RefreshStatus();
            };
            body.Controls.Add(paused);
            var copiesRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
            keepCopies.Text = "Guardar uma cópia de cada foto impressa";
            keepCopies.AutoSize = true;
            keepCopies.Checked = settings.KeepCopies;
            keepCopies.CheckedChanged += (s, e) => { settings.KeepCopies = keepCopies.Checked; settings.Save(); };
            copiesRow.Controls.Add(keepCopies);
            var open = new LinkLabel { Text = "Abrir pasta", AutoSize = true, Margin = new Padding(12, 4, 0, 0), LinkColor = Purple };
            open.LinkClicked += (s, e) =>
            {
                var dir = Settings.CopiesDir;
                Directory.CreateDirectory(dir);
                Process.Start("explorer.exe", "\"" + dir + "\"");
            };
            copiesRow.Controls.Add(open);
            body.Controls.Add(copiesRow);

            body.Controls.Add(Caption("Histórico"));
            log.Dock = DockStyle.Fill;
            log.Height = 180;
            log.BorderStyle = BorderStyle.FixedSingle;
            log.IntegralHeight = false;
            log.Font = new Font("Consolas", 9.5f);
            log.ForeColor = Ink;
            body.Controls.Add(log);

            footer.Dock = DockStyle.Bottom;
            footer.Height = 28;
            footer.TextAlign = ContentAlignment.MiddleRight;
            footer.Padding = new Padding(0, 0, 24, 0);
            footer.ForeColor = Muted;
            footer.Text = "Versão " + Assembly.GetExecutingAssembly().GetName().Version.ToString(3);
            footer.DoubleClick += (s, e) =>
            {
                var c = (AssemblyCopyrightAttribute)Attribute.GetCustomAttribute(Assembly.GetExecutingAssembly(), typeof(AssemblyCopyrightAttribute));
                footer.Text = "feito por " + (c?.Copyright ?? "");
            };

            Controls.Add(body);
            Controls.Add(footer);
            Controls.Add(header);
        }

        Control PrinterRow(string label, ComboBox combo, string profile)
        {
            var panel = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, Dock = DockStyle.Top, Margin = new Padding(0, 4, 0, 4) };
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            var l = new Label { Text = label, AutoSize = true, ForeColor = Muted, Margin = new Padding(0, 0, 0, 2) };
            panel.Controls.Add(l, 0, 0);
            panel.SetColumnSpan(l, 2);
            combo.DropDownStyle = ComboBoxStyle.DropDownList;
            combo.Dock = DockStyle.Fill;
            combo.Margin = new Padding(0, 2, 8, 0);
            combo.SelectedIndexChanged += (s, e) =>
            {
                string v = combo.SelectedIndex <= 0 ? "" : (string)combo.SelectedItem;
                if (profile == "tirinha") settings.PrinterTirinha = v; else settings.PrinterFoto = v;
                settings.Save();
                RefreshStatus();
            };
            panel.Controls.Add(combo, 0, 1);
            var test = Button("Imprimir teste");
            test.Click += (s, e) => PrintTest(profile);
            panel.Controls.Add(test, 1, 1);
            return panel;
        }

        static Label Caption(string text) => new Label
        {
            Text = text,
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 10.5f),
            ForeColor = Ink,
            Margin = new Padding(0, 10, 0, 2),
        };

        static Label Hint(string text) => new Label
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(600, 0),
            ForeColor = Muted,
            Margin = new Padding(0, 2, 0, 4),
        };

        static Control Rule() => new Panel { Height = 1, Dock = DockStyle.Top, BackColor = Line, Margin = new Padding(0, 12, 0, 4) };

        static Button Button(string text)
        {
            var b = new Button
            {
                Text = text,
                AutoSize = true,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.White,
                ForeColor = Purple,
                Padding = new Padding(10, 3, 10, 3),
                Cursor = Cursors.Hand,
            };
            b.FlatAppearance.BorderColor = Purple;
            return b;
        }

        void LoadPrinters()
        {
            var installed = WindowsPrinter.Installed();
            Fill(printerFoto, installed, settings.PrinterFoto, "Escolha a impressora");
            Fill(printerTirinha, installed, settings.PrinterTirinha, "Mesma da foto (sem corte)");
            if (string.IsNullOrEmpty(settings.PrinterFoto))
            {
                var dnp = installed.FirstOrDefault(p => p.IndexOf("RX1", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("DNP", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("DS", StringComparison.Ordinal) == 0);
                if (dnp != null) printerFoto.SelectedItem = dnp;
            }
        }

        static void Fill(ComboBox combo, List<string> items, string current, string empty)
        {
            combo.Items.Clear();
            combo.Items.Add(empty);
            foreach (var p in items) combo.Items.Add(p);
            int i = string.IsNullOrEmpty(current) ? 0 : combo.Items.IndexOf(current);
            combo.SelectedIndex = i < 0 ? 0 : i;
        }

        void StartServer()
        {
            server = new PrintServer(backend);
            server.Remaining = () => settings.Remaining;
            server.Log += msg => BeginInvoke((Action)(() => Note(msg)));
            server.JobChanged += job => BeginInvoke((Action)(() => OnJob(job)));
            try
            {
                server.Start();
                RefreshAddress();
                Note("Estação pronta na porta " + server.Port + ".");
            }
            catch (SocketException)
            {
                server = null;
                address.Text = "Porta " + PrintServer.DefaultPort + " ocupada";
                Note("Não consegui abrir a porta " + PrintServer.DefaultPort + ". Feche outro programa que esteja usando a porta e abra a estação de novo.");
            }
            RefreshStatus();
        }

        void OnJob(PrintJobItem job)
        {
            switch (job.State)
            {
                case JobState.Printing:
                    Note("Imprimindo " + job.Name + " em " + backend.PrinterFor(job.Profile));
                    break;
                case JobState.Done:
                    settings.PrintedTotal++;
                    if (settings.Remaining > 0) settings.Remaining--;
                    settings.Save();
                    UpdatePaper();
                    lastError = "";
                    Note("Pronta: " + job.Name);
                    break;
                case JobState.Error:
                    lastError = job.Message;
                    Note("Erro em " + job.Name + ": " + job.Message);
                    break;
            }
            RefreshStatus();
        }

        void PrintTest(string profile)
        {
            if (server == null) return;
            using (var bmp = WindowsPrinter.TestSheet(profile))
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                server.Enqueue(ms.ToArray(), profile, "teste-" + profile);
            }
        }

        void UpdatePaper()
        {
            int total = Math.Max(1, settings.RollSize);
            int left = Math.Max(0, Math.Min(settings.Remaining, total));
            paperText.Text = left + " de " + total + " folhas restantes";
            paperText.ForeColor = left <= 30 ? Bad : Ink;
            paperBar.Maximum = total;
            paperBar.Value = left;
        }

        void RefreshAddress()
        {
            if (server == null) return;
            var ips = LocalAddresses();
            address.Text = ips.Count == 0 ? "Sem rede conectada" : string.Join("\n", ips.Select(ip => ip + ":" + server.Port));
        }

        static List<string> LocalAddresses()
        {
            var list = new List<string>();
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                    string desc = (ni.Description + " " + ni.Name).ToLowerInvariant();
                    if (desc.Contains("virtual") || desc.Contains("vmware") || desc.Contains("hyper-v") || desc.Contains("vethernet") || desc.Contains("bluetooth")) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                        string ip = ua.Address.ToString();
                        if (ip.StartsWith("169.254.")) continue;
                        list.Add(ip);
                    }
                }
            }
            catch { }
            return list;
        }

        void RefreshStatus()
        {
            if (server == null)
            {
                status.Text = "● Parada";
                status.ForeColor = Bad;
                return;
            }
            int q = server.QueueLength;
            if (string.IsNullOrEmpty(settings.PrinterFoto)) { status.Text = "● Escolha a impressora abaixo"; status.ForeColor = Bad; }
            else if (server.Paused) { status.Text = "● Pausada" + (q > 0 ? " - " + q + " na fila" : ""); status.ForeColor = Gold; }
            else if (!string.IsNullOrEmpty(lastError)) { status.Text = "● Erro: " + lastError; status.ForeColor = Bad; }
            else if (q > 0) { status.Text = "● Imprimindo - " + q + " na fila"; status.ForeColor = Purple; }
            else { status.Text = "● Pronta para receber fotos"; status.ForeColor = Ok; }
        }

        void Note(string text)
        {
            log.Items.Insert(0, DateTime.Now.ToString("HH:mm:ss") + "  " + text);
            while (log.Items.Count > 300) log.Items.RemoveAt(log.Items.Count - 1);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (server != null && server.QueueLength > 0 && e.CloseReason == CloseReason.UserClosing)
            {
                var r = MessageBox.Show("Ainda há " + server.QueueLength + " foto(s) na fila. Fechar mesmo assim?", "Estação de impressão", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (r != DialogResult.Yes) { e.Cancel = true; return; }
            }
            tick.Stop();
            server?.Dispose();
            settings.Save();
            base.OnFormClosing(e);
        }
    }
}
