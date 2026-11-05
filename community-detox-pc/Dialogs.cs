using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace CommunityDetox
{
    /// <summary>The calm "you're on a detox" popup shown when something is blocked.</summary>
    internal sealed class BlockedForm : Form
    {
        private static BlockedForm current;

        private static readonly string[] Ideas =
        {
            "물 한 잔 마시기 💧", "창문 열고 심호흡 다섯 번 🌬️", "5분 동안 바깥 공기 쐬기 🚶",
            "어깨·목 가볍게 스트레칭 🙆", "읽던 책 두 페이지 읽기 📖", "좋아하는 노래 한 곡 듣기 🎧",
            "미뤄 둔 일 하나만 끝내기 ✅", "친구에게 안부 문자 보내기 💌", "눈 감고 1분 쉬기 😌",
            "책상 위 3분 정리하기 🧹", "오늘 고마웠던 일 하나 적어 보기 📝",
        };

        private readonly Label message, stats, idea;
        private readonly Timer timer = new Timer { Interval = 1000 };
        private readonly Random random = new Random();

        public static void ShowBlocked(string name)
        {
            if (current == null || current.IsDisposed)
            {
                current = new BlockedForm();
            }
            current.SetName(name);
            if (!current.Visible) current.Show();
            current.TopMost = true;
            current.Activate();
        }

        private BlockedForm()
        {
            var kit = new Kit(this);
            Text = "커뮤니티 디톡스";
            Icon = Theme.AppIcon();
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Theme.Bg;
            TopMost = true;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Padding = new Padding(kit.S(24));

            int w = kit.S(380);
            var col = kit.Column(this, w, Theme.Bg, 0, 0);
            var leaf = kit.Text(col, "🌿", 34, Theme.Text, false, w);
            leaf.Font = new Font("Segoe UI Emoji", 34);
            kit.Text(col, "잠깐, 디톡스 중이에요", 18, Theme.Text, true, w);
            message = kit.Text(col, "", 11, Theme.Sub, false, w);

            var card = kit.Column(col, w, Theme.AccentSoft, 14, 8);
            card.Margin = new Padding(0, kit.S(14), 0, kit.S(10));
            kit.Text(card, "대신 이건 어때요? (누르면 바뀌어요)", 9.5f, Theme.Accent, true, w - kit.S(30));
            idea = kit.Text(card, "", 13, Theme.Text, true, w - kit.S(30));
            EventHandler next = (s, e) => idea.Text = Ideas[random.Next(Ideas.Length)];
            card.Click += next;
            idea.Click += next;
            next(null, null);

            stats = kit.Text(col, "", 10, Theme.Sub, false, w);
            var ok = kit.Button(col, "확인", true, Close);
            ok.Margin = new Padding(0, kit.S(14), 0, 0);
            AcceptButton = ok;

            timer.Tick += (s, e) => UpdateStats();
            timer.Start();
            FormClosed += (s, e) => timer.Dispose();
        }

        private void SetName(string name)
        {
            message.Text = Theme.Topic(name) + " 지금 차단되어 있어요.\n습관처럼 열었다면, 잘 알아챘어요.";
            UpdateStats();
        }

        private void UpdateStats()
        {
            string s = "오늘 " + Store.TodayBlocks + "번 참았어요 💪 · 디톡스 " + Store.DetoxDay + "일째";
            if (Store.IsLocked) s += "\n🔒 집중 디톡스 남은 시간: " + Theme.Remaining(Store.LockRemaining);
            stats.Text = s;
        }
    }

    /// <summary>Pick days / hours / minutes, or an exact end date and time.</summary>
    internal sealed class DurationDialog : Form
    {
        public long UntilMs { get; private set; }

        private readonly bool extending;
        private readonly NumericUpDown days, hours, minutes;
        private readonly RadioButton byLength, byTime;
        private readonly DateTimePicker picker;
        private readonly Label preview;

        public DurationDialog(bool extending)
        {
            this.extending = extending;
            var kit = new Kit(this);
            Text = extending ? "연장 시간 정하기" : "집중 디톡스 시간 정하기";
            Icon = Theme.AppIcon();
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            BackColor = Theme.Bg;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Padding = new Padding(kit.S(18));
            Font = Theme.Font(10);

            int w = kit.S(380);
            var col = kit.Column(this, w, Theme.Bg, 0, 0);

            byLength = new RadioButton { Text = extending ? "얼마나 더 할지 정하기" : "얼마 동안 할지 정하기", Checked = true, AutoSize = true, Font = Theme.Font(10, true) };
            col.Controls.Add(byLength);
            var row = kit.Row(col, w);
            days = Num(row, kit, 0, 99, 0, "일");
            hours = Num(row, kit, 0, 23, extending ? 1 : 2, "시간");
            minutes = Num(row, kit, 0, 59, 0, "분");

            byTime = new RadioButton { Text = "끝나는 날짜·시각으로 정하기", AutoSize = true, Font = Theme.Font(10, true), Margin = new Padding(0, kit.S(12), 0, 0) };
            col.Controls.Add(byTime);
            picker = new DateTimePicker
            {
                Format = DateTimePickerFormat.Custom,
                CustomFormat = "yyyy년 M월 d일  tt h:mm",
                Width = kit.S(260),
                MinDate = DateTime.Now,
                MaxDate = DateTime.Now.AddDays(99),
                Value = DateTimeOffset.FromUnixTimeMilliseconds(Base() + 3600_000L).LocalDateTime,
            };
            col.Controls.Add(picker);

            preview = kit.Text(col, "", 11, Theme.Accent, true, w);
            preview.Margin = new Padding(0, kit.S(12), 0, kit.S(8));

            var buttons = kit.Row(col, w);
            var ok = kit.Button(buttons, "다음", true, Confirm);
            kit.Button(buttons, "취소", false, () => { DialogResult = DialogResult.Cancel; Close(); });
            AcceptButton = ok;

            EventHandler changed = (s, e) => UpdatePreview();
            days.ValueChanged += changed;
            hours.ValueChanged += changed;
            minutes.ValueChanged += changed;
            picker.ValueChanged += (s, e) => { byTime.Checked = true; UpdatePreview(); };
            byLength.CheckedChanged += changed;
            days.Enter += (s, e) => byLength.Checked = true;
            hours.Enter += (s, e) => byLength.Checked = true;
            minutes.Enter += (s, e) => byLength.Checked = true;
            UpdatePreview();
        }

        private static NumericUpDown Num(Control parent, Kit kit, int min, int max, int value, string unit)
        {
            var n = new NumericUpDown { Minimum = min, Maximum = max, Value = value, Width = kit.S(64), Font = Theme.Font(12) };
            parent.Controls.Add(n);
            var l = new Label { Text = unit, AutoSize = true, Font = Theme.Font(10, true), Margin = new Padding(kit.S(2), kit.S(8), kit.S(12), 0) };
            parent.Controls.Add(l);
            return n;
        }

        private long Base() => extending ? Math.Max(Store.Now, Store.LockUntil) : Store.Now;

        private long Compute()
        {
            if (byTime.Checked)
            {
                var t = picker.Value;
                return new DateTimeOffset(new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute, 0, DateTimeKind.Local)).ToUnixTimeMilliseconds();
            }
            return Base() + (long)days.Value * 86400_000L + (long)hours.Value * 3600_000L + (long)minutes.Value * 60_000L;
        }

        private void UpdatePreview()
        {
            long until = Compute();
            long added = until - Base();
            preview.Text = added < 60_000
                ? (extending ? "지금 끝나는 시각보다 뒤로 정해 주세요" : "1분 이상으로 정해 주세요")
                : (extending ? "+" + Theme.Duration(added) + " 연장" : Theme.Duration(added) + " 동안")
                  + "\n끝나는 시각: " + Theme.FormatTime(until);
        }

        private void Confirm()
        {
            long until = Compute();
            if (until - Base() < 60_000)
            {
                MessageBox.Show(this, extending ? "지금 끝나는 시각보다 뒤로 정해 주세요." : "1분 이상으로 정해 주세요.", Text);
                return;
            }
            UntilMs = until;
            DialogResult = DialogResult.OK;
            Close();
        }
    }

    /// <summary>Lists running programs that have a window, to add them to the block list.</summary>
    internal sealed class ProcessPicker : Form
    {
        public List<string> Selected { get; } = new List<string>();
        private readonly List<string> names = new List<string>();

        public ProcessPicker()
        {
            var kit = new Kit(this);
            Text = "차단할 프로그램 고르기";
            Icon = Theme.AppIcon();
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = MinimizeBox = false;
            ClientSize = new Size(kit.S(380), kit.S(440));
            BackColor = Theme.Bg;
            Font = Theme.Font(10);

            var hint = new Label { Text = "지금 실행 중인 프로그램이에요. 차단할 것을 체크하세요.", Dock = DockStyle.Top, Height = kit.S(32), Padding = new Padding(kit.S(8)) };
            var list = new CheckedListBox { Dock = DockStyle.Fill, CheckOnClick = true, IntegralHeight = false };
            var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = kit.S(52), FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(kit.S(8)) };
            kit.Button(bottom, "취소", false, () => { DialogResult = DialogResult.Cancel; Close(); });
            kit.Button(bottom, "추가", true, () =>
            {
                foreach (int i in list.CheckedIndices) Selected.Add(names[i]);
                DialogResult = DialogResult.OK;
                Close();
            });
            Controls.Add(list);
            Controls.Add(bottom);
            Controls.Add(hint);

            var self = Process.GetCurrentProcess().ProcessName;
            var items = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    if (p.MainWindowHandle != IntPtr.Zero && p.ProcessName != self && p.ProcessName != "explorer"
                        && !items.ContainsKey(p.ProcessName))
                    {
                        string title = p.MainWindowTitle;
                        items[p.ProcessName] = string.IsNullOrEmpty(title) ? p.ProcessName : p.ProcessName + "   (" + title + ")";
                    }
                }
                catch { }
                finally { p.Dispose(); }
            }
            foreach (var kv in items)
            {
                names.Add(kv.Key);
                list.Items.Add(kv.Value);
            }
        }
    }
}
