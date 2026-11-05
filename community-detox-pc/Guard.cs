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

        /// <summary>
        /// Starts the app right after Windows sign-in, elevated, without a UAC prompt.
        /// Registered from an XML definition because the schtasks defaults would otherwise
        /// skip it on battery power and stop it after 3 days.
        /// </summary>
        public static void EnsureAutoStart()
        {
            CreateTask(LogonTask, "커뮤니티 디톡스: 로그인하면 바로 시작", "--autostart",
                "<LogonTrigger><Enabled>true</Enabled><UserId>" + Esc(UserId) + "</UserId></LogonTrigger>");
        }

        public static bool IsAutoStartRegistered()
        {
            string output = Native.RunHidden("schtasks", $"/query /tn \"{LogonTask}\"");
            return output.IndexOf(LogonTask, StringComparison.OrdinalIgnoreCase) >= 0
                   && output.IndexOf("ERROR", StringComparison.OrdinalIgnoreCase) < 0;
        }

        private static string UserId => System.Security.Principal.WindowsIdentity.GetCurrent().Name;

        private static string Esc(string s) => TaskXml.Esc(s);

        private static void CreateTask(string name, string description, string arguments, string triggers)
        {
            string xml = TaskXml.Build(UserId, Exe, description, arguments, triggers);
            string file = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "CommunityDetox-" + name + ".xml");
            try
            {
                System.IO.File.WriteAllText(file, xml, System.Text.Encoding.Unicode);
                Schtasks($"/create /tn \"{name}\" /xml \"{file}\" /f");
            }
            catch (Exception e)
            {
                Log.Write("task " + name + ": " + e.Message);
            }
            finally
            {
                try { System.IO.File.Delete(file); } catch { }
            }
        }

        /// <summary>Called every few seconds by the main window.</summary>
        public static void Tick()
        {
            bool locked = Store.IsLocked;
            if (locked)
            {
                if (!minuteTaskOn)
                {
                    // Every minute (and at sign-in) during the lock: brings the app back if it was killed.
                    string start = DateTime.Now.AddMinutes(1).ToString("yyyy-MM-dd'T'HH:mm:ss");
                    CreateTask(MinuteTask, "커뮤니티 디톡스: 집중 디톡스 중 꺼지면 다시 시작", "--tray",
                        "<TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>" +
                        "<StartBoundary>" + start + "</StartBoundary><Enabled>true</Enabled></TimeTrigger>" +
                        "<LogonTrigger><Enabled>true</Enabled><UserId>" + Esc(UserId) + "</UserId></LogonTrigger>");
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
