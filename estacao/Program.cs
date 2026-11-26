using System;
using System.Threading;
using System.Windows.Forms;

namespace Cabine.Estacao
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            using (var mutex = new Mutex(true, "CabineMude.EstacaoImpressao", out bool first))
            {
                if (!first)
                {
                    MessageBox.Show("A estação de impressão já está aberta.", "Estação de impressão", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }
}
