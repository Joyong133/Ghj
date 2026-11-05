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
            // --launch <args>: start this exe with <args> and quit at once (detaches the new process).
            if (args.Length >= 1 && args[0] == "--launch")
            {
                try
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
                        Application.ExecutablePath, string.Join(" ", args, 1, args.Length - 1)) { UseShellExecute = false });
                }
                catch (Exception e) { Log.Write("launcher: " + e.Message); }
                return;
            }
            if (args.Length >= 1 && args[0] == "--watchdog")
            {
                Guard.RunWatchdog();
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

            // --autostart: started at Windows sign-in. --revived: brought back during a focus lock. Both start in the tray.
            bool autoStart = args.Length > 0 && args[0] == "--autostart";
            bool revived = args.Length > 0 && args[0] == "--revived";
            bool startHidden = autoStart || updated || revived || (args.Length > 0 && args[0] == "--tray");
            using (var mutex = new Mutex(false, Guard.MainMutexName))
            {
                // Ownership (not creation) decides who runs: the watchdog briefly holds this mutex when
                // the previous main process was killed, so wait a moment for it to be released.
                bool first;
                try { first = mutex.WaitOne(1500); }
                catch (AbandonedMutexException) { first = true; }
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

                Guard.SignalMainReady();
                Guard.EnsureAutoStart();
                Updater.Cleanup();
                var form = new MainForm(startHidden, autoStart, updated, revived);
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
                try { mutex.ReleaseMutex(); } catch { }
            }
        }
    }
}
