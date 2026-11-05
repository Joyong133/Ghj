using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace CommunityDetox
{
    /// <summary>
    /// Keeps the blocker running:
    ///  - starts with Windows (scheduled task at logon, elevated, no UAC prompt),
    ///  - during a focus lock: a watchdog process restarts the app if it is killed, and a
    ///    once-a-minute scheduled task brings it back even if both processes were killed.
    /// </summary>
    internal static class Guard
    {
        private const string LogonTask = "CommunityDetox";
        private const string MinuteTask = "CommunityDetoxGuard";
        private static Process watchdog;
        private static bool minuteTaskOn;

        private static string Exe => Application.ExecutablePath;

        public static void EnsureAutoStart()
        {
            Schtasks($"/create /tn \"{LogonTask}\" /sc onlogon /rl highest /f /tr \"\\\"{Exe}\\\" --tray\"");
        }

        /// <summary>Called every few seconds by the main window.</summary>
        public static void Tick()
        {
            bool locked = Store.IsLocked;
            if (locked)
            {
                if (!minuteTaskOn)
                {
                    Schtasks($"/create /tn \"{MinuteTask}\" /sc minute /mo 1 /rl highest /f /tr \"\\\"{Exe}\\\" --tray\"");
                    minuteTaskOn = true;
                }
                if (watchdog == null || watchdog.HasExited)
                {
                    try
                    {
                        watchdog = Process.Start(new ProcessStartInfo(Exe, "--watchdog " + Process.GetCurrentProcess().Id)
                        {
                            UseShellExecute = false,
                            CreateNoWindow = true,
                        });
                    }
                    catch (Exception e)
                    {
                        Log.Write("watchdog start: " + e.Message);
                    }
                }
            }
            else if (minuteTaskOn || watchdog != null)
            {
                Schtasks($"/delete /tn \"{MinuteTask}\" /f");
                minuteTaskOn = false;
                StopWatchdog();
            }
        }

        public static void StopWatchdog()
        {
            try
            {
                if (watchdog != null && !watchdog.HasExited) watchdog.Kill();
            }
            catch { }
            watchdog = null;
        }

        /// <summary>
        /// Runs in the separate "--watchdog" process: waits for the main process to end and,
        /// if a focus lock is still running, starts it again.
        /// </summary>
        public static void RunWatchdog(int mainPid)
        {
            try
            {
                using (var main = Process.GetProcessById(mainPid))
                {
                    main.WaitForExit();
                }
            }
            catch
            {
                // already gone
            }
            Thread.Sleep(500);
            var d = Store.Load();
            if (Store.Now < d.LockUntil)
            {
                try
                {
                    Process.Start(new ProcessStartInfo(Exe, "--tray") { UseShellExecute = false });
                }
                catch (Exception e)
                {
                    Log.Write("watchdog restart: " + e.Message);
                }
            }
        }

        /// <summary>Removes everything the app set up (only allowed when no focus lock is running).</summary>
        public static void Uninstall()
        {
            StopWatchdog();
            Schtasks($"/delete /tn \"{MinuteTask}\" /f");
            Schtasks($"/delete /tn \"{LogonTask}\" /f");
            Hosts.Remove();
            Store.DeleteAll();
        }

        private static void Schtasks(string args)
        {
            string output = Native.RunHidden("schtasks", args);
            if (output.IndexOf("ERROR", StringComparison.OrdinalIgnoreCase) >= 0
                || output.IndexOf("오류", StringComparison.Ordinal) >= 0)
            {
                Log.Write("schtasks " + args + " -> " + output.Trim());
            }
        }
    }
}
