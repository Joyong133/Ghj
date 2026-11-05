using System;
using System.Threading;
using System.Windows.Forms;

namespace CommunityDetox
{
    internal static class Program
    {
        public const string UpdateUrl = "https://github.com/Joyong133/Ghj/releases/tag/community-detox-pc-latest";

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length == 2 && args[0] == "--watchdog" && int.TryParse(args[1], out int pid))
            {
                Guard.RunWatchdog(pid);
                return;
            }

            bool startHidden = args.Length > 0 && args[0] == "--tray";
            using (var mutex = new Mutex(true, @"Global\CommunityDetoxMain", out bool first))
            {
                var showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Global\CommunityDetoxShow");
                if (!first)
                {
                    // Already running: bring that window to the front (unless we were started by a task).
                    if (!startHidden) showSignal.Set();
                    return;
                }

                Application.ThreadException += (s, e) => Log.Write("ui: " + e.Exception);
                AppDomain.CurrentDomain.UnhandledException += (s, e) => Log.Write("fatal: " + e.ExceptionObject);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                Guard.EnsureAutoStart();
                var form = new MainForm(startHidden);
                var waiter = new Thread(() =>
                {
                    while (true)
                    {
                        showSignal.WaitOne();
                        try { form.BeginInvoke(new Action(form.ShowFromTray)); } catch { }
                    }
                }) { IsBackground = true };
                waiter.Start();
                Application.Run(form);
                GC.KeepAlive(mutex);
            }
        }
    }
}
