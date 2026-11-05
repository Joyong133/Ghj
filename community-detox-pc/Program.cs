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

            // --after-update <pid>: started by the old version after an in-app update; wait until it has exited.
            bool updated = false;
            if (args.Length == 2 && args[0] == "--after-update" && int.TryParse(args[1], out int oldPid))
            {
                updated = true;
                try
                {
                    using (var old = System.Diagnostics.Process.GetProcessById(oldPid)) old.WaitForExit(20000);
                }
                catch { }
            }

            // --autostart: started at Windows sign-in. --tray: brought back by the guard. Both start in the tray.
            bool autoStart = args.Length > 0 && args[0] == "--autostart";
            bool startHidden = autoStart || updated || (args.Length > 0 && args[0] == "--tray");
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
                Updater.Cleanup();
                var form = new MainForm(startHidden, autoStart, updated);
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
