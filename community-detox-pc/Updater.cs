using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Windows.Forms;

namespace CommunityDetox
{
    /// <summary>
    /// In-app update: downloads the latest exe from the GitHub release, swaps the files and restarts.
    /// A running exe can't be overwritten on Windows, but it can be renamed, so:
    ///   CommunityDetox.exe -> CommunityDetox.old.exe, downloaded file -> CommunityDetox.exe, start it, exit.
    /// Works during a focus lock too: the new version takes over immediately and the lock continues.
    /// </summary>
    internal static class Updater
    {
        private const string DownloadUrl =
            "https://github.com/Joyong133/Ghj/releases/download/community-detox-pc-latest/CommunityDetox.exe";

        private static string Exe => Application.ExecutablePath;
        private static string Folder => Path.GetDirectoryName(Exe);
        private static string OldExe => Path.Combine(Folder, "CommunityDetox.old.exe");
        private static string DownloadPath => Path.Combine(Folder, "CommunityDetox.download.exe");

        public static Version Current => ParseVersion(FileVersionInfo.GetVersionInfo(Exe).FileVersion);

        public static Version ParseVersion(string s)
        {
            return Version.TryParse((s ?? "").Trim(), out var v) ? v : new Version(0, 0);
        }

        /// <summary>Downloads the latest build and returns its version (file kept for <see cref="Install"/>).</summary>
        public static Version DownloadLatest()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            if (File.Exists(DownloadPath)) File.Delete(DownloadPath);
            using (var wc = new WebClient())
            {
                wc.Headers[HttpRequestHeader.UserAgent] = "CommunityDetox-Updater";
                wc.DownloadFile(DownloadUrl, DownloadPath);
            }

            // Make sure it really is our program before ever running it.
            var info = new FileInfo(DownloadPath);
            byte[] head = new byte[2];
            using (var fs = File.OpenRead(DownloadPath)) fs.Read(head, 0, 2);
            var fvi = FileVersionInfo.GetVersionInfo(DownloadPath);
            if (info.Length < 50 * 1024 || head[0] != 'M' || head[1] != 'Z' || fvi.ProductName != "커뮤니티 디톡스 PC")
            {
                File.Delete(DownloadPath);
                throw new InvalidDataException("받은 파일이 커뮤니티 디톡스가 아니에요.");
            }
            return ParseVersion(fvi.FileVersion);
        }

        /// <summary>Swaps the exe files and starts the new version. The caller must exit right after.</summary>
        public static void Install()
        {
            if (File.Exists(OldExe)) File.Delete(OldExe);
            File.Move(Exe, OldExe);
            try
            {
                File.Move(DownloadPath, Exe);
            }
            catch
            {
                File.Move(OldExe, Exe); // put the old one back
                throw;
            }
            Process.Start(new ProcessStartInfo(Exe, "--after-update " + Process.GetCurrentProcess().Id)
            {
                UseShellExecute = false,
            });
        }

        /// <summary>Removes leftovers from a previous update.</summary>
        public static void Cleanup()
        {
            foreach (var f in new[] { OldExe, DownloadPath })
            {
                try { if (File.Exists(f)) File.Delete(f); } catch { }
            }
        }
    }
}
