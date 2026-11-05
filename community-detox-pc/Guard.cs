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

        public const string MainMutexName = @"Global\CommunityDetoxMain";
        private const string WatchdogMutexName = @"Global\CommunityDetoxWatchdog";
        private const string StopEventName = @"Global\CommunityDetoxWatchdogStop";
        private const string ReadyEventName = @"Global\CommunityDetoxMainReady";
        private static bool watchdogWanted;
        private static long lastSpawn;

        /// <summary>Called every second by the main window.</summary>
        public static void Tick()
        {
            bool locked = Store.IsLocked;
            if (locked)
            {
                if (!minuteTaskOn)
                {
                    // Every minute (and at sign-in) during the lock: last resort if both processes were killed at once.
                    string start = DateTime.Now.AddMinutes(1).ToString("yyyy-MM-dd'T'HH:mm:ss");
                    CreateTask(MinuteTask, "커뮤니티 디톡스: 집중 디톡스 중 꺼지면 다시 시작", "--revived",
                        "<TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>" +
                        "<StartBoundary>" + start + "</StartBoundary><Enabled>true</Enabled></TimeTrigger>" +
                        "<LogonTrigger><Enabled>true</Enabled><UserId>" + Esc(UserId) + "</UserId></LogonTrigger>");
                    minuteTaskOn = true;
                }
                // The watchdog's partner check: if it was killed, start a new one right away.
                if (!WatchdogAlive() && Store.Now - lastSpawn > 2000)
                {
                    lastSpawn = Store.Now;
                    watchdogWanted = true;
                    try
                    {
                        using (var stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName)) stop.Reset();
                    }
                    catch { }
                    Launch("--watchdog");
                }
            }
            else if (minuteTaskOn || watchdogWanted)
            {
                Schtasks($"/delete /tn \"{MinuteTask}\" /f");
                minuteTaskOn = false;
                StopWatchdog();
            }
        }

        private static bool WatchdogAlive()
        {
            try
            {
                if (Mutex.TryOpenExisting(WatchdogMutexName, out var m))
                {
                    m.Dispose();
                    return true;
                }
            }
            catch (UnauthorizedAccessException)
            {
                return true; // exists
            }
            return false;
        }

        /// <summary>Tells the watchdog to stop (lock ended, update, exit, uninstall).</summary>
        public static void StopWatchdog()
        {
            watchdogWanted = false;
            try
            {
                using (var stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName)) stop.Set();
            }
            catch { }
        }

        /// <summary>Main process: call right after taking the main mutex.</summary>
        public static void SignalMainReady()
        {
            try
            {
                using (var ready = new EventWaitHandle(false, EventResetMode.ManualReset, ReadyEventName)) ready.Set();
            }
            catch { }
        }

        /// <summary>
        /// Starts this exe with <paramref name="args"/> through a short-lived "--launch" process, so the new
        /// process is not a child of the caller ("End process tree" in Task Manager can't take both down).
        /// </summary>
        public static void Launch(string args)
        {
            try
            {
                Process.Start(new ProcessStartInfo(Exe, "--launch " + args) { UseShellExecute = false, CreateNoWindow = true });
            }
            catch (Exception e)
            {
                Log.Write("launch " + args + ": " + e.Message);
            }
        }

        /// <summary>
        /// The separate "--watchdog" process. It waits on the main process's mutex, so it learns the moment
        /// the main process ends (a killed process abandons its mutex) and, if a focus lock is still running,
        /// starts it again immediately. Only one watchdog runs at a time.
        /// </summary>
        public static void RunWatchdog()
        {
            var t = new Thread(WatchdogLoop) { IsBackground = false };
            t.SetApartmentState(ApartmentState.MTA);
            t.Start();
            t.Join();
        }

        private static void WatchdogLoop()
        {
            using (var self = new Mutex(false, WatchdogMutexName))
            {
                bool mine;
                try { mine = self.WaitOne(0); }
                catch (AbandonedMutexException) { mine = true; }
                if (!mine) return; // another watchdog is already on duty

                try
                {
                    using (var stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName))
                    using (var ready = new EventWaitHandle(false, EventResetMode.ManualReset, ReadyEventName))
                    using (var main = new Mutex(false, MainMutexName))
                    {
                        while (Locked())
                        {
                            int index;
                            try { index = WaitHandle.WaitAny(new WaitHandle[] { stop, main }); }
                            catch (AbandonedMutexException e) { index = e.MutexIndex; } // main was killed
                            if (index == 0) break;                                      // asked to stop

                            // We hold the main mutex now, so the main process is gone. Let go of it at once.
                            main.ReleaseMutex();
                            if (!Locked()) break;

                            ready.Reset();
                            Launch("--revived");
                            // Wait until the new main process has taken the mutex before watching again.
                            WaitHandle.WaitAny(new WaitHandle[] { stop, ready }, 15000);
                            if (stop.WaitOne(0)) break;
                        }
                    }
                }
                catch (Exception e)
                {
                    Log.Write("watchdog: " + e);
                }
                finally
                {
                    self.ReleaseMutex();
                }
            }
        }

        private static bool Locked() => Store.Now < Store.Load().LockUntil;

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
