using System;
using System.Drawing;
using System.Globalization;
using System.Windows.Forms;

namespace CommunityDetox
{
    internal static class Theme
    {
        public static readonly Color Bg = Color.FromArgb(0xF4, 0xF7, 0xF2);
        public static readonly Color Card = Color.White;
        public static readonly Color Text = Color.FromArgb(0x1D, 0x2A, 0x22);
        public static readonly Color Sub = Color.FromArgb(0x5B, 0x6B, 0x60);
        public static readonly Color Accent = Color.FromArgb(0x2E, 0x7D, 0x4F);
        public static readonly Color AccentSoft = Color.FromArgb(0xE3, 0xF1, 0xE8);
        public static readonly Color Danger = Color.FromArgb(0xC0, 0x39, 0x2B);
        public const string FontName = "Malgun Gothic";
        public static readonly CultureInfo Korean = new CultureInfo("ko-KR");

        public static Font Font(float size, bool bold = false) =>
            new Font(FontName, size, bold ? FontStyle.Bold : FontStyle.Regular);

        public static Icon AppIcon()
        {
            try
            {
                using (var s = typeof(Theme).Assembly.GetManifestResourceStream("app.ico"))
                {
                    if (s != null) return new Icon(s);
                }
            }
            catch { }
            return SystemIcons.Application;
        }

        /// <summary>"1일 2시간 3분 4초"</summary>
        public static string Remaining(long ms)
        {
            long s = Math.Max(0, ms / 1000);
            long d = s / 86400, h = s % 86400 / 3600, m = s % 3600 / 60, sec = s % 60;
            string r = "";
            if (d > 0) r += d + "일 ";
            if (d > 0 || h > 0) r += h + "시간 ";
            return r + m + "분 " + sec + "초";
        }

        /// <summary>"2일 3시간 30분" (rounded to the minute)</summary>
        public static string Duration(long ms)
        {
            long total = Math.Max(0, (ms + 30000) / 60000);
            long d = total / 1440, h = total % 1440 / 60, m = total % 60;
            string r = "";
            if (d > 0) r += d + "일 ";
            if (h > 0) r += h + "시간 ";
            if (m > 0 || r.Length == 0) r += m + "분 ";
            return r.Trim();
        }

        public static string FormatTime(long ms) =>
            DateTimeOffset.FromUnixTimeMilliseconds(ms).LocalDateTime.ToString("M월 d일 (ddd) tt h:mm", Korean);

        /// <summary>Korean topic particle: 디시인사이드는 / 에브리타임은.</summary>
        public static string Topic(string word)
        {
            if (string.IsNullOrEmpty(word)) return "";
            char last = word[word.Length - 1];
            if (last >= 0xAC00 && last <= 0xD7A3) return word + ((last - 0xAC00) % 28 == 0 ? "는" : "은");
            return word + "은(는)";
        }
    }

    /// <summary>Small code-only layout kit, DPI aware.</summary>
    internal sealed class Kit
    {
        private readonly Control owner;
        public Kit(Control owner) { this.owner = owner; }

        public int S(int px) => (int)Math.Round(px * owner.DeviceDpi / 96.0);

        public FlowLayoutPanel Column(Control parent, int width, Color back, int pad, int bottomMargin)
        {
            var c = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                BackColor = back,
                Padding = new Padding(S(pad)),
                Margin = new Padding(0, 0, 0, S(bottomMargin)),
                MinimumSize = new Size(width, 0),
                MaximumSize = new Size(width, 0),
            };
            parent.Controls.Add(c);
            return c;
        }

        public FlowLayoutPanel Row(Control parent, int width)
        {
            var r = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = true,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                MaximumSize = new Size(width, 0),
                Margin = new Padding(0, S(6), 0, 0),
                BackColor = Color.Transparent,
            };
            parent.Controls.Add(r);
            return r;
        }

        public Label Text(Control parent, string s, float size, Color color, bool bold, int maxWidth)
        {
            var l = new Label
            {
                Text = s,
                AutoSize = true,
                MaximumSize = new Size(maxWidth, 0),
                Font = Theme.Font(size, bold),
                ForeColor = color,
                Margin = new Padding(0, S(3), 0, S(3)),
                BackColor = Color.Transparent,
            };
            parent.Controls.Add(l);
            return l;
        }

        public Button Button(Control parent, string s, bool primary, Action onClick)
        {
            var b = new Button
            {
                Text = s,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlatStyle = FlatStyle.Flat,
                BackColor = primary ? Theme.Accent : Theme.AccentSoft,
                ForeColor = primary ? Color.White : Theme.Accent,
                Font = Theme.Font(10, true),
                Padding = new Padding(S(10), S(5), S(10), S(5)),
                Margin = new Padding(0, 0, S(8), S(6)),
                Cursor = Cursors.Hand,
                UseVisualStyleBackColor = false,
            };
            b.FlatAppearance.BorderSize = 0;
            b.Click += (s2, e) => onClick();
            parent.Controls.Add(b);
            return b;
        }
    }
}
