using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Cabine.Estacao
{
    public enum JobState { Queued, Printing, Done, Error }

    public sealed class PrintJobItem
    {
        public string Id;
        public string Profile;
        public string Name;
        public byte[] Data;
        public DateTime Received;
        public JobState State;
        public string Message = "";
    }

    public interface IPrinterBackend
    {
        void Print(PrintJobItem job);
        string PrinterFor(string profile);
        bool IsOnline(string profile);
    }

    public sealed class PrintServer : IDisposable
    {
        public const int DefaultPort = 8787;
        const int MaxBody = 40 * 1024 * 1024;

        readonly IPrinterBackend backend;
        readonly object gate = new object();
        readonly Queue<PrintJobItem> queue = new Queue<PrintJobItem>();
        readonly Dictionary<string, PrintJobItem> jobs = new Dictionary<string, PrintJobItem>();
        readonly AutoResetEvent signal = new AutoResetEvent(false);
        TcpListener listener;
        Thread acceptThread;
        Thread workThread;
        volatile bool running;
        int seq;

        public int Port { get; }
        public volatile bool Paused;
        public Func<int> Remaining = () => -1;
        public event Action<PrintJobItem> JobChanged;
        public event Action<string> Log;

        public PrintServer(IPrinterBackend backend, int port = DefaultPort)
        {
            this.backend = backend;
            Port = port;
        }

        public int QueueLength { get { lock (gate) return queue.Count; } }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Any, Port);
            listener.Start();
            running = true;
            acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "accept" };
            acceptThread.Start();
            workThread = new Thread(WorkLoop) { IsBackground = true, Name = "print" };
            workThread.Start();
        }

        public void Dispose()
        {
            running = false;
            try { listener?.Stop(); } catch { }
            signal.Set();
        }

        public PrintJobItem Enqueue(byte[] data, string profile, string name)
        {
            var job = new PrintJobItem
            {
                Id = DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture) + "-" + Interlocked.Increment(ref seq),
                Profile = profile == "tirinha" ? "tirinha" : "foto",
                Name = string.IsNullOrWhiteSpace(name) ? "foto" : name,
                Data = data,
                Received = DateTime.Now,
                State = JobState.Queued,
            };
            lock (gate)
            {
                queue.Enqueue(job);
                jobs[job.Id] = job;
                if (jobs.Count > 300)
                {
                    var old = new List<string>();
                    foreach (var kv in jobs) if (kv.Value.State == JobState.Done || kv.Value.State == JobState.Error) old.Add(kv.Key);
                    for (int i = 0; i < old.Count - 100; i++) jobs.Remove(old[i]);
                }
            }
            JobChanged?.Invoke(job);
            signal.Set();
            return job;
        }

        public void Resume() => signal.Set();

        void WorkLoop()
        {
            while (running)
            {
                PrintJobItem job = null;
                if (!Paused)
                    lock (gate) if (queue.Count > 0) job = queue.Peek();
                if (job == null)
                {
                    signal.WaitOne(1000);
                    continue;
                }
                job.State = JobState.Printing;
                JobChanged?.Invoke(job);
                try
                {
                    backend.Print(job);
                    job.State = JobState.Done;
                    job.Message = "Enviada para " + backend.PrinterFor(job.Profile);
                }
                catch (Exception ex)
                {
                    job.State = JobState.Error;
                    job.Message = ex.Message;
                }
                job.Data = null;
                lock (gate) queue.Dequeue();
                JobChanged?.Invoke(job);
            }
        }

        void AcceptLoop()
        {
            while (running)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch { if (!running) return; continue; }
                ThreadPool.QueueUserWorkItem(_ => Handle(client));
            }
        }

        void Handle(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 30000;
                    client.SendTimeout = 30000;
                    var stream = client.GetStream();
                    var head = ReadHead(stream, out byte[] extra);
                    if (head == null) return;
                    var lines = head.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var first = lines[0].Split(' ');
                    if (first.Length < 2) return;
                    string method = first[0].ToUpperInvariant();
                    string target = first[1];
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 1; i < lines.Length; i++)
                    {
                        int c = lines[i].IndexOf(':');
                        if (c > 0) headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
                    }
                    string path = target;
                    var query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    int q = target.IndexOf('?');
                    if (q >= 0)
                    {
                        path = target.Substring(0, q);
                        foreach (var part in target.Substring(q + 1).Split('&'))
                        {
                            if (part.Length == 0) continue;
                            int e = part.IndexOf('=');
                            string k = Uri.UnescapeDataString((e < 0 ? part : part.Substring(0, e)).Replace('+', ' '));
                            string v = e < 0 ? "" : Uri.UnescapeDataString(part.Substring(e + 1).Replace('+', ' '));
                            query[k] = v;
                        }
                    }

                    if (method == "OPTIONS") { Send(stream, 204, null); return; }

                    if (method == "GET" && (path == "/" || path == "/status"))
                    {
                        Send(stream, 200, StatusJson());
                        return;
                    }

                    if (method == "GET" && path == "/job")
                    {
                        query.TryGetValue("id", out string id);
                        PrintJobItem job;
                        int position = 0;
                        lock (gate)
                        {
                            jobs.TryGetValue(id ?? "", out job);
                            if (job != null) foreach (var j in queue) { if (j == job) break; position++; }
                        }
                        if (job == null) { Send(stream, 404, Obj("ok", false, "erro", "Pedido não encontrado")); return; }
                        Send(stream, 200, Obj("ok", true, "id", job.Id, "estado", StateName(job.State), "mensagem", job.Message, "posicao", position));
                        return;
                    }

                    if (method == "POST" && path == "/print")
                    {
                        headers.TryGetValue("Content-Length", out string lenText);
                        if (!int.TryParse(lenText, out int len) || len <= 0) { Send(stream, 411, Obj("ok", false, "erro", "Arquivo vazio")); return; }
                        if (len > MaxBody) { Send(stream, 413, Obj("ok", false, "erro", "Arquivo grande demais")); return; }
                        var body = new byte[len];
                        int got = Math.Min(extra.Length, len);
                        Buffer.BlockCopy(extra, 0, body, 0, got);
                        while (got < len)
                        {
                            int n = stream.Read(body, got, len - got);
                            if (n <= 0) break;
                            got += n;
                        }
                        if (got < len) { Send(stream, 400, Obj("ok", false, "erro", "Envio incompleto")); return; }
                        if (!(body.Length > 3 && ((body[0] == 0xFF && body[1] == 0xD8) || (body[0] == 0x89 && body[1] == 0x50))))
                        {
                            Send(stream, 415, Obj("ok", false, "erro", "Envie JPG ou PNG"));
                            return;
                        }
                        query.TryGetValue("perfil", out string profile);
                        query.TryGetValue("nome", out string name);
                        var job = Enqueue(body, profile, name);
                        Log?.Invoke($"Recebida {job.Name} ({job.Profile}) de {((IPEndPoint)client.Client.RemoteEndPoint).Address}");
                        Send(stream, 200, Obj("ok", true, "id", job.Id, "posicao", QueueLength - 1));
                        return;
                    }

                    Send(stream, 404, Obj("ok", false, "erro", "Caminho desconhecido"));
                }
                catch (Exception ex)
                {
                    Log?.Invoke("Falha na conexão: " + ex.Message);
                }
            }
        }

        string StatusJson()
        {
            return Obj(
                "ok", true,
                "nome", "Estação de impressão",
                "versao", "1.0",
                "pausada", Paused,
                "fila", QueueLength,
                "folhas", Remaining(),
                "foto", backend.PrinterFor("foto") ?? "",
                "tirinha", backend.PrinterFor("tirinha") ?? "",
                "online", backend.IsOnline("foto"));
        }

        static string StateName(JobState s)
        {
            switch (s)
            {
                case JobState.Queued: return "fila";
                case JobState.Printing: return "imprimindo";
                case JobState.Done: return "pronta";
                default: return "erro";
            }
        }

        static string ReadHead(NetworkStream stream, out byte[] extra)
        {
            var buf = new byte[8192];
            var ms = new MemoryStream();
            extra = new byte[0];
            while (ms.Length < 64 * 1024)
            {
                int n = stream.Read(buf, 0, buf.Length);
                if (n <= 0) return null;
                ms.Write(buf, 0, n);
                var all = ms.GetBuffer();
                int len = (int)ms.Length;
                for (int i = 3; i < len; i++)
                {
                    if (all[i - 3] == 13 && all[i - 2] == 10 && all[i - 1] == 13 && all[i] == 10)
                    {
                        extra = new byte[len - i - 1];
                        Buffer.BlockCopy(all, i + 1, extra, 0, extra.Length);
                        return Encoding.ASCII.GetString(all, 0, i - 3);
                    }
                }
            }
            return null;
        }

        static void Send(NetworkStream stream, int code, string json)
        {
            var body = json == null ? new byte[0] : Encoding.UTF8.GetBytes(json);
            string reason = code == 200 ? "OK" : code == 204 ? "No Content" : code == 404 ? "Not Found" : "Error";
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(reason).Append("\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
            sb.Append("Access-Control-Allow-Private-Network: true\r\n");
            sb.Append("Access-Control-Max-Age: 600\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            if (json != null) sb.Append("Content-Type: application/json; charset=utf-8\r\n");
            sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
            sb.Append("Connection: close\r\n\r\n");
            var head = Encoding.ASCII.GetBytes(sb.ToString());
            stream.Write(head, 0, head.Length);
            if (body.Length > 0) stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        public static string Obj(params object[] kv)
        {
            var sb = new StringBuilder("{");
            for (int i = 0; i + 1 < kv.Length; i += 2)
            {
                if (i > 0) sb.Append(',');
                sb.Append(Str((string)kv[i])).Append(':');
                var v = kv[i + 1];
                if (v is bool b) sb.Append(b ? "true" : "false");
                else if (v is int n) sb.Append(n.ToString(CultureInfo.InvariantCulture));
                else sb.Append(Str(v?.ToString() ?? ""));
            }
            return sb.Append('}').ToString();
        }

        static string Str(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }
}
