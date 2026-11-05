using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

namespace CommunityDetox
{
    /// <summary>
    /// Background loop that does the actual blocking:
    ///  1. hosts file: blocked sites don't load in any browser or program,
    ///  2. browser tabs: the front browser's title / address bar is checked and the tab is closed,
    ///  3. programs: blocked programs (e.g. Discord) are closed,
    ///  4. KakaoTalk: its in-app browser windows showing a community (or all of them) are closed.
    /// </summary>
    internal sealed class Blocker
    {
        /// <summary>(key, display name) when something was blocked.</summary>
        public event Action<string> Blocked;

        private static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "chrome", "msedge", "firefox", "whale", "opera", "opera_gx", "brave", "vivaldi", "iexplore",
            "chromium", "librewolf", "waterfox", "floorp", "arc", "yandex", "naverwhale", "duckduckgo",
        };

        private Thread thread;
        private volatile bool running;
        private Rules rules = new Rules();
        private bool rulesDirty = true;
        private string lastBlockedKey;
        private long lastBlockedAt;
        private long lastHostsCheck, lastProcessCheck;
        private readonly Dictionary<IntPtr, AutomationElement> addressBars = new Dictionary<IntPtr, AutomationElement>();

        public string HostsStatus { get; private set; } = "";

        public void Start()
        {
            Store.Changed += () => rulesDirty = true;
            running = true;
            thread = new Thread(Loop) { IsBackground = true, Name = "Blocker" };
            thread.SetApartmentState(ApartmentState.MTA);
            thread.Start();
        }

        public void Stop() => running = false;

        private void Loop()
        {
            while (running)
            {
                try
                {
                    Tick();
                }
                catch (Exception e)
                {
                    Log.Write("blocker: " + e);
                }
                Thread.Sleep(600);
            }
        }

        private void Tick()
        {
            long now = Store.Now;
            bool active = Store.IsBlockingActive;
            if (rulesDirty)
            {
                rulesDirty = false;
                rules = Store.BuildRules();
                lastHostsCheck = 0;
            }

            // 1) hosts file: re-checked every few seconds, so manual edits are put back.
            if (now - lastHostsCheck > 5000)
            {
                lastHostsCheck = now;
                HostsStatus = Hosts.Apply(active ? rules : null);
            }
            if (!active) return;

            // 3) programs
            if (now - lastProcessCheck > 1500 && rules.Processes.Count > 0)
            {
                lastProcessCheck = now;
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        if (rules.Processes.TryGetValue(p.ProcessName.ToLowerInvariant(), out var name))
                        {
                            p.Kill();
                            Fire("proc:" + p.ProcessName, name ?? p.ProcessName);
                        }
                    }
                    catch { }
                    finally { p.Dispose(); }
                }
            }

            // 2) the browser window in front
            CheckForegroundBrowser();

            // 4) KakaoTalk in-app browser windows
            CheckKakaoTalk();
        }

        private void CheckForegroundBrowser()
        {
            IntPtr hwnd = Native.GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return;
            string proc = Native.ProcessNameOf(hwnd);
            if (proc == null || !Browsers.Contains(proc)) return;

            string title = Native.TitleOf(hwnd);
            string hit = rules.MatchTitle(title);
            if (hit == null)
            {
                string d = rules.MatchUrlText(title);
                if (d != null) hit = rules.NameForDomain(d);
            }
            if (hit == null)
            {
                string d = rules.MatchUrlText(ReadAddressBar(hwnd));
                if (d != null) hit = rules.NameForDomain(d);
            }
            if (hit == null) return;

            if (!Fire("web:" + hwnd + ":" + hit, hit)) return;
            // Close the tab (Ctrl+W) if that browser is still in front.
            if (Native.GetForegroundWindow() == hwnd) Native.SendCtrl('W');
        }

        /// <summary>Address bar text via UI Automation (Chrome, Edge, Whale, Firefox, ...).</summary>
        private string ReadAddressBar(IntPtr hwnd)
        {
            try
            {
                if (!addressBars.TryGetValue(hwnd, out var edit) || edit == null)
                {
                    if (addressBars.Count > 50) addressBars.Clear();
                    var root = AutomationElement.FromHandle(hwnd);
                    edit = root.FindFirst(TreeScope.Descendants,
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
                    addressBars[hwnd] = edit;
                    if (edit == null) return null;
                }
                if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out var p))
                {
                    return ((ValuePattern)p).Current.Value;
                }
            }
            catch
            {
                addressBars.Remove(hwnd);
            }
            return null;
        }

        private void CheckKakaoTalk()
        {
            foreach (var w in Native.TopLevelWindowsOf("KakaoTalk"))
            {
                string title = Native.TitleOf(w);
                if (string.IsNullOrEmpty(title) || title == "카카오톡" || title == "KakaoTalk") continue;
                // In-app browser windows host a web view (Chromium / IE); chat windows don't.
                if (!Native.HasWebViewChild(w)) continue;

                string hit = rules.MatchTitle(title);
                if (hit == null)
                {
                    string d = rules.MatchUrlText(title);
                    if (d != null) hit = rules.NameForDomain(d);
                }
                if (hit == null && rules.KakaoBlockAll) hit = "카카오톡 인앱 브라우저";
                if (hit == null) continue;

                Native.PostMessage(w, Native.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                Fire("kakao:" + w, hit);
            }
        }

        /// <summary>Reports a block unless the same thing was just reported. Returns false if suppressed.</summary>
        private bool Fire(string key, string name)
        {
            long now = Store.Now;
            if (key == lastBlockedKey && now - lastBlockedAt < 1500) return false;
            lastBlockedKey = key;
            lastBlockedAt = now;
            Store.RecordBlock();
            Blocked?.Invoke(name);
            return true;
        }
    }

    /// <summary>Keeps a marked section of the Windows hosts file in sync with the block list.</summary>
    internal static class Hosts
    {
        private const string Begin = "# >>> CommunityDetox (커뮤니티 디톡스) - do not edit";
        private const string End = "# <<< CommunityDetox";
        private static readonly string HostsPath =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"drivers\etc\hosts");

        /// <summary>Writes the block section (or removes it when rules is null). Returns a status text.</summary>
        public static string Apply(Rules rules)
        {
            try
            {
                string current = File.Exists(HostsPath) ? File.ReadAllText(HostsPath) : "";
                string next = Compose(current, rules);
                if (next != current)
                {
                    var attr = File.GetAttributes(HostsPath);
                    if ((attr & FileAttributes.ReadOnly) != 0) File.SetAttributes(HostsPath, attr & ~FileAttributes.ReadOnly);
                    File.WriteAllText(HostsPath, next, new UTF8Encoding(false));
                    Native.RunHidden("ipconfig", "/flushdns");
                }
                return rules != null ? "사이트 차단 적용됨 (hosts)" : "사이트 차단 꺼짐";
            }
            catch (Exception e)
            {
                Log.Write("hosts: " + e.Message);
                return "hosts 파일을 바꾸지 못했어요 (백신 프로그램이 막았을 수 있어요)";
            }
        }

        public static void Remove() => Apply(null);

        /// <summary>The hosts file text with our section replaced (or removed when rules is null).</summary>
        internal static string Compose(string current, Rules rules)
        {
            string without = Strip(current);
            if (rules == null || rules.Domains.Count == 0) return without;
            var sb = new StringBuilder(without.TrimEnd('\r', '\n'));
            sb.Append("\r\n\r\n").Append(Begin).Append("\r\n");
            foreach (var host in HostNames(rules))
            {
                sb.Append("0.0.0.0 ").Append(host).Append("\r\n");
                sb.Append(":: ").Append(host).Append("\r\n");
            }
            sb.Append(End).Append("\r\n");
            return sb.ToString();
        }

        private static IEnumerable<string> HostNames(Rules rules)
        {
            var all = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var d in rules.Domains.Keys)
            {
                if (IsAscii(d))
                {
                    all.Add(d);
                    all.Add("www." + d);
                    all.Add("m." + d);
                }
            }
            foreach (var h in rules.ExtraHosts) all.Add(h);
            return all;
        }

        private static bool IsAscii(string s) => s.All(c => c < 128);

        private static string Strip(string text)
        {
            int b = text.IndexOf(Begin, StringComparison.Ordinal);
            if (b < 0) return text;
            int e = text.IndexOf(End, b, StringComparison.Ordinal);
            string after = e < 0 ? "" : text.Substring(e + End.Length);
            string before = text.Substring(0, b).TrimEnd('\r', '\n');
            string rest = after.TrimStart('\r', '\n');
            return rest.Length > 0 ? before + "\r\n" + rest : before + "\r\n";
        }
    }

    internal static class Native
    {
        public const uint WM_CLOSE = 0x0010;

        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

        private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);

        public static string TitleOf(IntPtr hwnd)
        {
            var sb = new StringBuilder(512);
            GetWindowText(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        private static string ClassOf(IntPtr hwnd)
        {
            var sb = new StringBuilder(256);
            GetClassName(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        public static string ProcessNameOf(IntPtr hwnd)
        {
            try
            {
                GetWindowThreadProcessId(hwnd, out uint pid);
                using (var p = Process.GetProcessById((int)pid)) return p.ProcessName;
            }
            catch
            {
                return null;
            }
        }

        public static List<IntPtr> TopLevelWindowsOf(string processName)
        {
            var pids = new HashSet<uint>();
            foreach (var p in Process.GetProcessesByName(processName))
            {
                pids.Add((uint)p.Id);
                p.Dispose();
            }
            var list = new List<IntPtr>();
            if (pids.Count == 0) return list;
            EnumWindows((h, l) =>
            {
                GetWindowThreadProcessId(h, out uint pid);
                if (pids.Contains(pid) && IsWindowVisible(h)) list.Add(h);
                return true;
            }, IntPtr.Zero);
            return list;
        }

        public static bool HasWebViewChild(IntPtr hwnd)
        {
            bool found = false;
            EnumChildWindows(hwnd, (h, l) =>
            {
                string c = ClassOf(h);
                if (c.StartsWith("Chrome_") || c.StartsWith("Cef") || c == "Internet Explorer_Server"
                    || c.IndexOf("WebView", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    found = true;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        public static void SendCtrl(char key)
        {
            const byte VK_CONTROL = 0x11;
            const uint KEYUP = 0x0002;
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event((byte)key, 0, 0, UIntPtr.Zero);
            keybd_event((byte)key, 0, KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYUP, UIntPtr.Zero);
        }

        public static string RunHidden(string file, string args)
        {
            try
            {
                var psi = new ProcessStartInfo(file, args)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                using (var p = Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
                    p.WaitForExit(15000);
                    return output;
                }
            }
            catch (Exception e)
            {
                Log.Write("run " + file + ": " + e.Message);
                return "";
            }
        }
    }
}
