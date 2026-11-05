using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace CommunityDetox
{
    [DataContract]
    internal sealed class SettingsData
    {
        [DataMember] public bool MasterOn = true;
        [DataMember] public long LockUntil;
        [DataMember] public List<string> EnabledPresets; // null = defaults
        [DataMember] public List<string> CustomDomains = new List<string>();
        [DataMember] public List<string> CustomProcesses = new List<string>();
        [DataMember] public long TotalBlocks;
        [DataMember] public string Day = "";
        [DataMember] public int DayCount;
        [DataMember] public long StartedAt;
        [DataMember] public long PauseUntil;
        [DataMember] public bool PauseUsed;
        [DataMember] public bool KakaoBlockAll;
    }

    /// <summary>All settings and stats, saved to %ProgramData%\CommunityDetox\settings.json.</summary>
    internal static class Store
    {
        public static readonly string Dir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "CommunityDetox");
        private static readonly string FilePath = Path.Combine(Dir, "settings.json");
        private static readonly object Gate = new object();
        private static SettingsData data;

        public static event Action Changed;

        public static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static SettingsData Load()
        {
            try
            {
                if (File.Exists(FilePath))
                {
                    using (var fs = File.OpenRead(FilePath))
                    {
                        var d = (SettingsData)new DataContractJsonSerializer(typeof(SettingsData)).ReadObject(fs);
                        if (d.CustomDomains == null) d.CustomDomains = new List<string>();
                        if (d.CustomProcesses == null) d.CustomProcesses = new List<string>();
                        if (d.Day == null) d.Day = "";
                        return d;
                    }
                }
            }
            catch (Exception e)
            {
                Log.Write("settings load failed: " + e.Message);
            }
            return new SettingsData();
        }

        private static SettingsData D
        {
            get
            {
                if (data == null)
                {
                    data = Load();
                    if (data.StartedAt == 0) data.StartedAt = Now;
                }
                return data;
            }
        }

        private static void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                var ms = new MemoryStream();
                new DataContractJsonSerializer(typeof(SettingsData)).WriteObject(ms, D);
                string tmp = FilePath + ".tmp";
                File.WriteAllBytes(tmp, ms.ToArray());
                if (File.Exists(FilePath)) File.Replace(tmp, FilePath, null);
                else File.Move(tmp, FilePath);
            }
            catch (Exception e)
            {
                Log.Write("settings save failed: " + e.Message);
            }
        }

        private static void Mutate(Action<SettingsData> change)
        {
            lock (Gate)
            {
                change(D);
                Save();
            }
            Changed?.Invoke();
        }

        // ---- on / off / focus lock / pause ----

        public static bool MasterOn => D.MasterOn;
        public static void SetMasterOn(bool on) => Mutate(d => d.MasterOn = on);

        public static long LockUntil => D.LockUntil;
        public static bool IsLocked => Now < D.LockUntil;

        /// <summary>Locks until <paramref name="untilMs"/>. A running lock can only be extended.</summary>
        public static void LockUntilAtLeast(long untilMs) => Mutate(d =>
        {
            bool wasLocked = Now < d.LockUntil;
            d.LockUntil = Math.Max(d.LockUntil, untilMs);
            d.MasterOn = true;
            if (!wasLocked)
            {
                d.PauseUsed = false; // a new focus detox gets a fresh one-time pause
                d.PauseUntil = 0;
            }
        });

        public static long PauseUntil => D.PauseUntil;
        public static bool IsPaused => IsLocked && Now < D.PauseUntil;
        public static bool PauseUsed => D.PauseUsed;

        public static bool StartPause(long durationMs)
        {
            if (!IsLocked || PauseUsed || IsPaused) return false;
            Mutate(d =>
            {
                d.PauseUntil = Now + durationMs;
                d.LockUntil += durationMs; // the focus timer stops while paused
                d.PauseUsed = true;
            });
            return true;
        }

        public static void EndPauseNow()
        {
            if (!IsPaused) return;
            Mutate(d =>
            {
                long unused = d.PauseUntil - Now;
                d.PauseUntil = Now;
                d.LockUntil -= unused;
            });
        }

        /// <summary>Focus time left; frozen while paused.</summary>
        public static long LockRemaining => Math.Max(0, D.LockUntil - Math.Max(Now, IsPaused ? D.PauseUntil : Now));

        public static bool IsBlockingActive => (D.MasterOn || IsLocked) && !IsPaused;

        // ---- what is blocked ----

        public static HashSet<string> EnabledPresets =>
            D.EnabledPresets != null
                ? new HashSet<string>(D.EnabledPresets)
                : new HashSet<string>(Catalog.All.Where(e => e.DefaultOn).Select(e => e.Id));

        public static void SetPresetsEnabled(IEnumerable<string> ids, bool on)
        {
            var set = EnabledPresets;
            foreach (var id in ids)
            {
                if (on) set.Add(id); else set.Remove(id);
            }
            Mutate(d => d.EnabledPresets = set.ToList());
        }

        public static List<string> CustomDomains => D.CustomDomains.ToList();
        public static void AddCustomDomain(string host) => Mutate(d => { if (!d.CustomDomains.Contains(host)) d.CustomDomains.Add(host); });
        public static void RemoveCustomDomain(string host) => Mutate(d => d.CustomDomains.Remove(host));

        public static List<string> CustomProcesses => D.CustomProcesses.ToList();
        public static void AddCustomProcess(string name) => Mutate(d =>
        {
            if (!d.CustomProcesses.Any(p => string.Equals(p, name, StringComparison.OrdinalIgnoreCase))) d.CustomProcesses.Add(name);
        });
        public static void RemoveCustomProcess(string name) => Mutate(d => d.CustomProcesses.Remove(name));

        public static bool KakaoBlockAll => D.KakaoBlockAll;
        public static void SetKakaoBlockAll(bool on) => Mutate(d => d.KakaoBlockAll = on);

        // ---- stats ----

        private static string Today => DateTime.Now.ToString("yyyyMMdd");

        public static void RecordBlock() => Mutate(d =>
        {
            if (d.Day != Today) { d.Day = Today; d.DayCount = 0; }
            d.DayCount++;
            d.TotalBlocks++;
        });

        public static int TodayBlocks => D.Day == Today ? D.DayCount : 0;
        public static long TotalBlocks => D.TotalBlocks;
        public static long DetoxDay => (Now - D.StartedAt) / (24L * 3600 * 1000) + 1;

        public static void DeleteAll()
        {
            lock (Gate)
            {
                try { if (File.Exists(FilePath)) File.Delete(FilePath); } catch { }
                data = new SettingsData { StartedAt = Now, MasterOn = false };
            }
        }

        // ---- compiled rules for the blocker ----

        public static Rules BuildRules()
        {
            lock (Gate)
            {
                var r = new Rules { KakaoBlockAll = D.KakaoBlockAll };
                var on = EnabledPresets;
                foreach (var e in Catalog.All.Where(x => on.Contains(x.Id)))
                {
                    foreach (var d in e.Domains) r.Domains[d] = e.Name;
                    foreach (var h in e.ExtraHosts) r.ExtraHosts.Add(h);
                    foreach (var p in e.Processes) r.Processes[p.ToLowerInvariant()] = e.Name;
                    foreach (var k in e.TitleKeywords) r.TitleKeywords[k] = e.Name;
                }
                foreach (var d in D.CustomDomains) r.Domains[d] = d;
                foreach (var p in D.CustomProcesses)
                {
                    string key = Rules.NormalizeProcess(p);
                    if (!r.Processes.ContainsKey(key)) r.Processes[key] = p;
                }
                return r;
            }
        }
    }

    internal sealed class Rules
    {
        public readonly Dictionary<string, string> Domains = new Dictionary<string, string>();
        public readonly HashSet<string> ExtraHosts = new HashSet<string>();
        public readonly Dictionary<string, string> Processes = new Dictionary<string, string>();
        public readonly Dictionary<string, string> TitleKeywords = new Dictionary<string, string>();
        public bool KakaoBlockAll;

        public static string NormalizeProcess(string name)
        {
            string n = name.Trim().ToLowerInvariant();
            return n.EndsWith(".exe") ? n.Substring(0, n.Length - 4) : n;
        }

        /// <summary>Blocked domain found in address-bar style text, or null.</summary>
        public string MatchUrlText(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            foreach (var token in text.Trim().ToLowerInvariant().Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string host = HostOf(token);
                if (host == null) continue;
                string hit = MatchHost(host);
                if (hit != null) return hit;
            }
            return null;
        }

        public string MatchHost(string host)
        {
            string h = host;
            while (true)
            {
                if (Domains.ContainsKey(h)) return h;
                int dot = h.IndexOf('.');
                if (dot < 0) return null;
                h = h.Substring(dot + 1);
            }
        }

        /// <summary>Community name if the window / page title contains one of its keywords.</summary>
        public string MatchTitle(string title)
        {
            if (string.IsNullOrEmpty(title)) return null;
            foreach (var kv in TitleKeywords)
            {
                if (title.IndexOf(kv.Key, StringComparison.Ordinal) >= 0) return kv.Value;
            }
            return null;
        }

        public string NameForDomain(string d) => Domains.TryGetValue(d, out var n) ? n : d;

        /// <summary>"https://www.Example.com/path" -> "example.com"; null if it doesn't look like a host.</summary>
        public static string HostOf(string raw)
        {
            if (raw == null) return null;
            string s = raw.Trim().ToLowerInvariant();
            int scheme = s.IndexOf("://", StringComparison.Ordinal);
            if (scheme >= 0) s = s.Substring(scheme + 3);
            int at = s.IndexOf('@');
            int slash = s.IndexOf('/');
            if (at >= 0 && (slash < 0 || at < slash)) s = s.Substring(at + 1);
            int end = s.Length;
            foreach (char ch in new[] { '/', '?', '#', ':' })
            {
                int i = s.IndexOf(ch);
                if (i >= 0 && i < end) end = i;
            }
            s = s.Substring(0, end).TrimEnd('.');
            if (s.StartsWith("www.")) s = s.Substring(4);
            if (s.IndexOf('.') <= 0 || s.Length > 253) return null;
            foreach (char ch in s)
            {
                bool ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '.' || char.IsLetter(ch);
                if (!ok) return null;
            }
            return s;
        }

        /// <summary>"gall.dcinside.com" yes; "3.5" or "v1.2" no.</summary>
        public static bool LooksLikeDomain(string host)
        {
            if (host == null) return false;
            string tld = host.Substring(host.LastIndexOf('.') + 1);
            return tld.Length >= 2 && tld.All(char.IsLetter);
        }
    }

    internal static class Log
    {
        public static void Write(string msg)
        {
            try
            {
                Directory.CreateDirectory(Store.Dir);
                string path = Path.Combine(Store.Dir, "log.txt");
                if (File.Exists(path) && new FileInfo(path).Length > 512 * 1024) File.Delete(path);
                File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + msg + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
