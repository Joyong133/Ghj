using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace CommunityDetox
{
    internal sealed class MainForm : Form
    {
        private const long Minute = 60_000L, Hour = 60 * Minute, Day = 24 * Hour;

        private readonly Kit kit;
        private readonly Blocker blocker = new Blocker();
        private readonly NotifyIcon tray;
        private readonly TabControl tabs;
        private readonly FlowLayoutPanel home, list, custom, kakao, info;
        private readonly Timer timer = new Timer { Interval = 1000 };
        private bool allowVisible;
        private bool exiting;
        private bool dirty = true;
        private string lastState = "";
        private Label lockCountdown, pauseCountdown, statusLabel;
        private bool trayHintShown;
        private int guardTicks;

        private bool? autoStartOk;
        private Version newVersion;       // a newer build found by the update check
        private bool updating;
        private long lastUpdateCheck;

        public MainForm(bool startHidden, bool autoStart, bool updated, bool revived)
        {
            kit = new Kit(this);
            allowVisible = !startHidden;
            Text = "커뮤니티 디톡스";
            Icon = Theme.AppIcon();
            BackColor = Theme.Bg;
            Font = Theme.Font(10);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(kit.S(600), kit.S(720));
            MinimumSize = new Size(kit.S(520), kit.S(520));

            var header = new Panel { Dock = DockStyle.Top, Height = kit.S(76), BackColor = Theme.Bg, Padding = new Padding(kit.S(18), kit.S(12), kit.S(18), 0) };
            var title = new Label { Text = "🌿 커뮤니티 디톡스", Font = Theme.Font(17, true), ForeColor = Theme.Text, AutoSize = true, Location = new Point(kit.S(16), kit.S(10)) };
            var subtitle = new Label { Text = "커뮤니티 사이트와 프로그램을 잠시 멀리하고, 내 시간을 되찾아요.", Font = Theme.Font(9.5f), ForeColor = Theme.Sub, AutoSize = true, Location = new Point(kit.S(18), kit.S(46)) };
            header.Controls.Add(title);
            header.Controls.Add(subtitle);

            tabs = new TabControl { Dock = DockStyle.Fill, Font = Theme.Font(10), Padding = new Point(kit.S(12), kit.S(5)) };
            home = Page("홈");
            list = Page("차단 목록");
            custom = Page("직접 추가");
            kakao = Page("카카오톡");
            info = Page("보호 · 정보");
            Controls.Add(tabs);
            Controls.Add(header);

            tray = new NotifyIcon { Icon = Theme.AppIcon(), Text = "커뮤니티 디톡스", Visible = true };
            var menu = new ContextMenuStrip();
            menu.Items.Add("열기", null, (s, e) => ShowFromTray());
            var exit = menu.Items.Add("종료", null, (s, e) => ExitApp());
            menu.Opening += (s, e) =>
            {
                exit.Enabled = !Store.IsLocked;
                exit.Text = Store.IsLocked ? "종료 (집중 디톡스 중에는 불가)" : "종료";
            };
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => ShowFromTray();

            Store.Changed += () => dirty = true;
            blocker.Blocked += name =>
            {
                try { BeginInvoke(new Action(() => BlockedForm.ShowBlocked(name))); } catch { }
            };
            blocker.Start();

            if (!Store.IsLocked) Native.RunHidden("schtasks", "/delete /tn \"CommunityDetoxGuard\" /f");
            timer.Tick += (s, e) => OnTick();
            timer.Start();
            Resize += (s, e) => { if (WindowState != FormWindowState.Minimized) dirty = true; };
            Render();

            Guard.Tick(); // start the watchdog right away if a focus lock is running
            if (revived && Store.IsLocked)
            {
                tray.ShowBalloonTip(4000, "🔒 다시 켜졌어요",
                    "집중 디톡스 중이라 꺼지지 않아요. 남은 시간 " + Theme.Remaining(Store.LockRemaining), ToolTipIcon.Info);
            }
            else if (updated)
            {
                tray.ShowBalloonTip(4000, "🌿 업데이트했어요",
                    "커뮤니티 디톡스 " + Updater.Current.ToString(3) + " 버전으로 다시 켜졌어요."
                    + (Store.IsLocked ? " 집중 디톡스는 그대로 이어져요." : ""), ToolTipIcon.Info);
            }
            else if (autoStart)
            {
                tray.ShowBalloonTip(4000, "🌿 커뮤니티 디톡스가 켜졌어요",
                    Store.IsLocked ? "집중 디톡스 이어서 진행 중 · 남은 시간 " + Theme.Remaining(Store.LockRemaining)
                                   : Store.IsBlockingActive ? "커뮤니티 차단을 시작했어요." : "차단은 꺼져 있어요. 트레이 아이콘을 눌러 켜세요.",
                    ToolTipIcon.Info);
            }
            System.Threading.Tasks.Task.Run(() =>
            {
                autoStartOk = Guard.IsAutoStartRegistered();
                dirty = true;
            });
        }

        private FlowLayoutPanel Page(string name)
        {
            var page = new TabPage(name) { BackColor = Theme.Bg };
            var flow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = true,
                BackColor = Theme.Bg,
                Padding = new Padding(kit.S(14)),
            };
            page.Controls.Add(flow);
            tabs.TabPages.Add(page);
            return flow;
        }

        // ------------------------------------------------------------------ window / tray

        protected override void SetVisibleCore(bool value)
        {
            if (!allowVisible)
            {
                value = false;
                if (!IsHandleCreated) CreateHandle();
            }
            base.SetVisibleCore(value);
        }

        public void ShowFromTray()
        {
            allowVisible = true;
            Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            dirty = true;
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!exiting && e.CloseReason == CloseReason.UserClosing)
            {
                // Keep blocking in the background.
                e.Cancel = true;
                Hide();
                if (!trayHintShown)
                {
                    trayHintShown = true;
                    tray.ShowBalloonTip(3000, "커뮤니티 디톡스", "창을 닫아도 작업 표시줄 오른쪽 아래에서 계속 차단하고 있어요.", ToolTipIcon.Info);
                }
                return;
            }
            base.OnFormClosing(e);
        }

        private void ExitApp()
        {
            if (Store.IsLocked)
            {
                MessageBox.Show("집중 디톡스 중에는 종료할 수 없어요 🔒", Text);
                return;
            }
            if (MessageBox.Show("종료하면 모든 차단이 멈춰요. (다음에 컴퓨터를 켜면 다시 시작돼요)\n종료할까요?", Text,
                    MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            exiting = true;
            blocker.Stop();
            Hosts.Remove();
            Guard.StopWatchdog();
            tray.Visible = false;
            Application.Exit();
        }

        private void OnTick()
        {
            string state = Store.IsLocked + "/" + Store.IsPaused + "/" + Store.IsBlockingActive;
            if (state != lastState) dirty = true;
            if (dirty && Visible) Render();
            if (lockCountdown != null) lockCountdown.Text = "남은 시간  " + Theme.Remaining(Store.LockRemaining);
            if (pauseCountdown != null) pauseCountdown.Text = "⏸ 일시정지 남은 시간  " + Theme.Remaining(Store.PauseUntil - Store.Now);
            if (statusLabel != null && blocker.HostsStatus.Length > 0) statusLabel.Text = blocker.HostsStatus;
            tray.Text = Store.IsPaused ? "커뮤니티 디톡스 (일시정지)" : Store.IsBlockingActive ? "커뮤니티 디톡스 (차단 중)" : "커뮤니티 디톡스 (꺼짐)";
            ++guardTicks;
            Guard.Tick();
            if (guardTicks == 60 || Store.Now - lastUpdateCheck > 12 * Hour && lastUpdateCheck != 0) CheckForUpdate(false);
        }

        // ------------------------------------------------------------------ rendering

        private int Width0(FlowLayoutPanel page) => Math.Max(kit.S(320), page.ClientSize.Width - page.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth - kit.S(4));

        private void Render()
        {
            dirty = false;
            lastState = Store.IsLocked + "/" + Store.IsPaused + "/" + Store.IsBlockingActive;
            lockCountdown = pauseCountdown = statusLabel = null;
            foreach (var page in new[] { home, list, custom, kakao, info })
            {
                var scroll = page.AutoScrollPosition;
                page.SuspendLayout();
                foreach (Control c in page.Controls.Cast<Control>().ToList()) c.Dispose();
                page.Controls.Clear();
                if (page == home) RenderHome();
                else if (page == list) RenderList();
                else if (page == custom) RenderCustom();
                else if (page == kakao) RenderKakao();
                else RenderInfo();
                page.ResumeLayout();
                page.AutoScrollPosition = new Point(-scroll.X, -scroll.Y);
            }
        }

        private FlowLayoutPanel Card(FlowLayoutPanel page, Color? back = null) =>
            kit.Column(page, Width0(page), back ?? Theme.Card, 16, 12);

        private int Inner(FlowLayoutPanel page) => Width0(page) - kit.S(34);

        private Label Title(Control card, FlowLayoutPanel page, string s) => kit.Text(card, s, 12.5f, Theme.Text, true, Inner(page));
        private Label Body(Control card, FlowLayoutPanel page, string s) => kit.Text(card, s, 10, Theme.Sub, false, Inner(page));

        private void RenderHome()
        {
            var p = home;
            bool locked = Store.IsLocked, paused = Store.IsPaused, active = Store.IsBlockingActive;

            var status = Card(p, active ? Theme.AccentSoft : (Color?)null);
            kit.Text(status, paused ? "⏸ 일시정지 중이에요" : active ? "✅ 차단이 작동 중이에요" : "⛔ 차단이 꺼져 있어요", 13, active ? Theme.Accent : Theme.Danger, true, Inner(p));
            statusLabel = Body(status, p, blocker.HostsStatus);
            var master = new CheckBox
            {
                Text = "차단 켜기",
                Checked = Store.MasterOn || locked,
                Enabled = !locked,
                AutoSize = true,
                Font = Theme.Font(11, true),
                Margin = new Padding(0, kit.S(8), 0, kit.S(4)),
            };
            master.CheckedChanged += (s, e) => Store.SetMasterOn(master.Checked);
            status.Controls.Add(master);
            if (locked) Body(status, p, "집중 디톡스 중에는 끌 수 없어요.");
            kit.Text(status, $"오늘 참은 횟수 {Store.TodayBlocks}번 · 누적 {Store.TotalBlocks}번 · 디톡스 {Store.DetoxDay}일째", 10.5f, Theme.Text, true, Inner(p));

            var focus = Card(p, locked ? Theme.AccentSoft : (Color?)null);
            if (locked)
            {
                Title(focus, p, paused ? "⏸ 집중 디톡스 일시정지 중" : "🔒 집중 디톡스 진행 중");
                lockCountdown = kit.Text(focus, "남은 시간  " + Theme.Remaining(Store.LockRemaining), 15, Theme.Accent, true, Inner(p));
                Body(focus, p, "끝나는 시각: " + Theme.FormatTime(Store.LockUntil));
                Body(focus, p, "끝날 때까지 차단을 끄거나, 목록에서 빼거나, 프로그램을 종료할 수 없어요. 새로 추가하는 건 언제든 가능해요.");
                kit.Text(focus, "연장하기", 10.5f, Theme.Text, true, Inner(p)).Margin = new Padding(0, kit.S(10), 0, 0);
                QuickButtons(focus, p, new[] { "+10분", "+30분", "+1시간", "+3시간", "+1일", "+3일" },
                    new[] { 10 * Minute, 30 * Minute, Hour, 3 * Hour, Day, 3 * Day }, true);
                kit.Button(kit.Row(focus, Inner(p)), "⏱ 연장 시간 직접 정하기", true, () => CustomLock(true));
                PauseSection(focus, p);
            }
            else
            {
                Title(focus, p, "🔒 집중 디톡스");
                Body(focus, p, "정한 시간 동안은 차단을 끄거나 목록에서 빼거나 프로그램을 종료할 수 없게 잠가요. 의지가 약해지는 순간을 막아 줘요.");
                QuickButtons(focus, p, new[] { "30분", "1시간", "3시간", "6시간", "하루", "7일" },
                    new[] { 30 * Minute, Hour, 3 * Hour, 6 * Hour, Day, 7 * Day }, false);
                kit.Button(kit.Row(focus, Inner(p)), "⏱ 시간 직접 정하기", true, () => CustomLock(false));
            }
        }

        private void QuickButtons(Control card, FlowLayoutPanel p, string[] labels, long[] durations, bool extending)
        {
            var row = kit.Row(card, Inner(p));
            for (int i = 0; i < labels.Length; i++)
            {
                long d = durations[i];
                kit.Button(row, labels[i], false, () => ConfirmLock(Base(extending) + d, extending));
            }
        }

        private static long Base(bool extending) => extending ? Math.Max(Store.Now, Store.LockUntil) : Store.Now;

        private void CustomLock(bool extending)
        {
            using (var dlg = new DurationDialog(extending))
            {
                if (dlg.ShowDialog(this) == DialogResult.OK) ConfirmLock(dlg.UntilMs, extending);
            }
        }

        private void ConfirmLock(long untilMs, bool extending)
        {
            long added = untilMs - Base(extending);
            string what = extending ? Theme.Duration(added) + " 연장" : Theme.Duration(added) + " 집중 디톡스";
            if (MessageBox.Show(this, $"끝나는 시각: {Theme.FormatTime(untilMs)}\n\n그때까지 차단을 끄거나, 목록에서 빼거나, 프로그램을 종료할 수 없어요.\n"
                                      + (extending ? "연장할까요?" : "정말 시작할까요?"), what, MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            Store.LockUntilAtLeast(untilMs);
            Guard.Tick();
            Render();
        }

        private void PauseSection(Control card, FlowLayoutPanel p)
        {
            var line = new Label { BorderStyle = BorderStyle.Fixed3D, Height = 2, Width = Inner(p), Margin = new Padding(0, kit.S(10), 0, kit.S(8)) };
            card.Controls.Add(line);
            if (Store.IsPaused)
            {
                pauseCountdown = kit.Text(card, "⏸ 일시정지 남은 시간  " + Theme.Remaining(Store.PauseUntil - Store.Now), 11.5f, Theme.Text, true, Inner(p));
                Body(card, p, "지금은 커뮤니티가 차단되지 않아요. 일시정지 동안 디톡스 시간은 멈춰 있어요.");
                kit.Button(kit.Row(card, Inner(p)), "▶ 지금 바로 다시 시작", true, () => { Store.EndPauseNow(); Render(); });
                return;
            }
            if (Store.PauseUsed)
            {
                Body(card, p, "⏸ 일시정지는 이번 집중 디톡스에서 이미 사용했어요.");
                return;
            }
            kit.Text(card, "⏸ 일시정지 (1회)", 10.5f, Theme.Text, true, Inner(p));
            Body(card, p, "이번 집중 디톡스에서 딱 한 번, 잠깐 차단을 풀 수 있어요. 그동안 디톡스 시간은 멈춰요.");
            var row = kit.Row(card, Inner(p));
            foreach (var (label, ms) in new[] { ("5분", 5 * Minute), ("10분", 10 * Minute), ("15분", 15 * Minute), ("30분", 30 * Minute) })
            {
                kit.Button(row, label, false, () =>
                {
                    if (MessageBox.Show(this, $"일시정지는 이번 집중 디톡스에서 1번만 쓸 수 있어요.\n{label} 동안 차단이 풀리고, 끝나는 시각도 {label} 늦춰져요.\n\n정말 쉬어 갈까요?",
                            label + " 일시정지", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
                    Store.StartPause(ms);
                    Render();
                });
            }
        }

        private void RenderList()
        {
            var p = list;
            bool locked = Store.IsLocked;
            var on = Store.EnabledPresets;
            foreach (var category in Catalog.Categories)
            {
                var entries = Catalog.InCategory(category).ToList();
                var card = Card(p);
                Title(card, p, category);
                var row = kit.Row(card, Inner(p));
                kit.Button(row, "전체 켜기", false, () => { Store.SetPresetsEnabled(entries.Select(e => e.Id), true); Render(); });
                if (!locked) kit.Button(row, "전체 끄기", false, () => { Store.SetPresetsEnabled(entries.Select(e => e.Id), false); Render(); });
                foreach (var e in entries)
                {
                    string extra = e.Processes.Length > 0 ? "  · 프로그램: " + string.Join(", ", e.Processes.Select(x => x + ".exe")) : "";
                    var cb = new CheckBox
                    {
                        Text = e.Name + "   " + e.DomainSummary + extra,
                        Checked = on.Contains(e.Id),
                        AutoSize = true,
                        MaximumSize = new Size(Inner(p), 0),
                        Font = Theme.Font(10),
                        ForeColor = Theme.Text,
                        Margin = new Padding(0, kit.S(3), 0, kit.S(3)),
                    };
                    cb.CheckedChanged += (s, ev) =>
                    {
                        if (!cb.Checked && Store.IsLocked)
                        {
                            cb.Checked = true;
                            LockedMessage();
                            return;
                        }
                        Store.SetPresetsEnabled(new[] { e.Id }, cb.Checked);
                    };
                    card.Controls.Add(cb);
                }
            }
        }

        private void RenderCustom()
        {
            var p = custom;
            bool locked = Store.IsLocked;

            var sites = Card(p);
            Title(sites, p, "🌐 사이트 직접 추가");
            Body(sites, p, "주소를 넣으면 www. / m. 주소도 함께 막고, 브라우저 주소창에 보이면 탭을 닫아요. 예: example.com");
            var row = kit.Row(sites, Inner(p));
            var input = new TextBox { Width = kit.S(260), Font = Theme.Font(11) };
            row.Controls.Add(input);
            Action add = () =>
            {
                string host = Rules.HostOf(input.Text);
                if (host == null || !Rules.LooksLikeDomain(host))
                {
                    MessageBox.Show(this, "올바른 주소를 입력해 주세요 (예: example.com)", Text);
                    return;
                }
                Store.AddCustomDomain(host);
                Render();
            };
            kit.Button(row, "추가", true, add);
            input.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; add(); } };
            foreach (var d in Store.CustomDomains.OrderBy(x => x)) RemovableRow(sites, p, d, locked, () => Store.RemoveCustomDomain(d));

            var progs = Card(p);
            Title(progs, p, "💻 프로그램 직접 차단");
            Body(progs, p, "차단한 프로그램은 켜지면 바로 종료돼요. 실행 파일 이름(예: Discord.exe)을 넣거나 실행 중인 프로그램에서 고르세요.");
            var prow = kit.Row(progs, Inner(p));
            var pinput = new TextBox { Width = kit.S(200), Font = Theme.Font(11) };
            prow.Controls.Add(pinput);
            Action addProc = () =>
            {
                string n = pinput.Text.Trim();
                if (n.Length == 0) return;
                if (!n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) n += ".exe";
                Store.AddCustomProcess(n);
                Render();
            };
            kit.Button(prow, "추가", true, addProc);
            pinput.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; addProc(); } };
            kit.Button(prow, "실행 중인 프로그램에서 고르기", false, () =>
            {
                using (var picker = new ProcessPicker())
                {
                    if (picker.ShowDialog(this) != DialogResult.OK) return;
                    foreach (var n in picker.Selected) Store.AddCustomProcess(n + ".exe");
                    Render();
                }
            });
            foreach (var n in Store.CustomProcesses.OrderBy(x => x)) RemovableRow(progs, p, n, locked, () => Store.RemoveCustomProcess(n));
        }

        private void RemovableRow(Control card, FlowLayoutPanel p, string name, bool locked, Action remove)
        {
            var row = kit.Row(card, Inner(p));
            row.BackColor = Theme.AccentSoft;
            row.Padding = new Padding(kit.S(8), kit.S(2), kit.S(4), kit.S(2));
            row.MinimumSize = new Size(Inner(p), 0);
            var l = kit.Text(row, name, 10.5f, Theme.Text, true, Inner(p) - kit.S(80));
            l.Margin = new Padding(0, kit.S(8), kit.S(10), 0);
            var x = kit.Button(row, "✕ 빼기", false, () =>
            {
                if (Store.IsLocked) { LockedMessage(); return; }
                remove();
                Render();
            });
            x.BackColor = Color.White;
            if (locked) x.ForeColor = Color.Gray;
        }

        private void RenderKakao()
        {
            var p = kakao;
            bool locked = Store.IsLocked;
            var card = Card(p);
            Title(card, p, "💬 카카오톡 인앱 브라우저");
            Body(card, p, "카카오톡 PC에서 링크를 눌러 카톡 안의 브라우저 창으로 열린 페이지도 확인해요. "
                          + "창 제목에 차단 목록의 커뮤니티가 보이면 그 창을 닫아요. (대화방 창은 건드리지 않아요)");
            var all = new CheckBox
            {
                Text = "카카오톡 인앱 브라우저 아예 막기 (카톡 안에서 열리는 링크 창을 모두 닫아요)",
                Checked = Store.KakaoBlockAll,
                AutoSize = true,
                MaximumSize = new Size(Inner(p), 0),
                Font = Theme.Font(10.5f, true),
                Margin = new Padding(0, kit.S(10), 0, kit.S(4)),
            };
            all.Enabled = !(locked && Store.KakaoBlockAll);
            all.CheckedChanged += (s, e) =>
            {
                if (!all.Checked && Store.IsLocked) { all.Checked = true; LockedMessage(); return; }
                Store.SetKakaoBlockAll(all.Checked);
            };
            card.Controls.Add(all);
            Body(card, p, "카톡 설정에서 링크를 '기본 브라우저로 열기'로 바꿔도 크롬·엣지 등에서 차단 목록이 그대로 적용돼요.");
        }

        private void RenderInfo()
        {
            var p = info;
            bool locked = Store.IsLocked;

            var guard = Card(p);
            Title(guard, p, "🛡️ 꺼지지 않게 보호");
            kit.Text(guard, autoStartOk == null ? "자동 시작 확인 중…"
                    : autoStartOk == true ? "✅ 컴퓨터를 켜고 로그인하면 바로 시작돼요"
                    : "⚠️ 자동 시작이 등록되지 않았어요", 11, autoStartOk == false ? Theme.Danger : Theme.Accent, true, Inner(p));
            if (autoStartOk == false)
            {
                kit.Button(kit.Row(guard, Inner(p)), "자동 시작 다시 등록", true, () =>
                {
                    Guard.EnsureAutoStart();
                    autoStartOk = Guard.IsAutoStartRegistered();
                    Render();
                });
            }
            Body(guard, p,
                "• 컴퓨터를 켜고 로그인하면 바로 시작돼요 (노트북 배터리 상태에서도, 며칠을 켜 둬도 계속 동작).\n" +
                "• 컴퓨터를 꺼도 사이트 차단(hosts)은 그대로 남아 있어서, 켜자마자 막혀 있어요.\n" +
                "• 창을 닫아도 작업 표시줄 오른쪽 아래(트레이)에서 계속 차단해요.\n" +
                "• 집중 디톡스 중에는:\n" +
                "    - 종료와 프로그램 제거가 막혀요.\n" +
                "    - 작업 관리자로 끝내도 바로 다시 켜져요. 두 프로세스가 서로를 지켜보고 있어서 하나를 끄면 다른 하나가 즉시 되살려요.\n" +
                "      (\"프로세스 트리 끝내기\"로도 함께 꺼지지 않아요. 둘을 한꺼번에 끄더라도 1분 안에 다시 켜져요)\n" +
                "    - hosts 파일을 직접 고쳐도 몇 초 안에 원래대로 돌아가요.");

            var ver = Card(p, newVersion != null ? Theme.AccentSoft : (Color?)null);
            Title(ver, p, "⬇️ 업데이트");
            Body(ver, p, "지금 버전: " + Updater.Current.ToString(3));
            if (newVersion != null)
            {
                kit.Text(ver, "✨ 새 버전 " + newVersion.ToString(3) + "이 나왔어요", 11, Theme.Accent, true, Inner(p));
                kit.Button(kit.Row(ver, Inner(p)), updating ? "설치하는 중…" : "지금 업데이트", true, () => InstallUpdate(newVersion));
            }
            else
            {
                kit.Button(kit.Row(ver, Inner(p)), updating ? "확인하는 중…" : "업데이트 확인", false, () => CheckForUpdate(true));
            }
            Body(ver, p, "버튼 하나로 새 버전을 받아 바로 바꿔 끼우고 다시 켜져요. 집중 디톡스 중에도 업데이트할 수 있고, "
                         + "남은 시간·설정·기록은 그대로 이어져요. (새 버전은 12시간마다 자동으로 확인해요)");
            kit.Button(kit.Row(ver, Inner(p)), "다운로드 페이지 열기", false, () =>
            {
                try { Process.Start(new ProcessStartInfo(Program.UpdateUrl) { UseShellExecute = true }); } catch { }
            });

            var remove = Card(p);
            Title(remove, p, "🗑️ 프로그램 제거");
            if (locked)
            {
                Body(remove, p, "집중 디톡스가 끝나면 제거할 수 있어요.");
            }
            else
            {
                Body(remove, p, "hosts 차단, 자동 시작, 설정과 기록을 모두 지워요. 그다음 CommunityDetox.exe 파일만 지우면 끝이에요.");
                var b = kit.Button(kit.Row(remove, Inner(p)), "프로그램 제거", false, Uninstall);
                b.ForeColor = Theme.Danger;
            }

            var privacy = Card(p);
            Title(privacy, p, "🔒 개인정보");
            Body(privacy, p, "앞에 열린 브라우저의 제목과 주소창 글자, 실행 중인 프로그램 이름만 이 컴퓨터 안에서 확인해요. 아무것도 외부로 보내지 않아요.");
        }

        /// <summary>Downloads the latest build in the background and compares versions.</summary>
        private void CheckForUpdate(bool userAsked)
        {
            if (updating) return;
            updating = true;
            lastUpdateCheck = Store.Now;
            dirty = true;
            System.Threading.Tasks.Task.Run(() =>
            {
                Version latest = null;
                string error = null;
                try { latest = Updater.DownloadLatest(); }
                catch (Exception e) { error = e.Message; Log.Write("update check: " + e.Message); }
                BeginInvoke(new Action(() =>
                {
                    updating = false;
                    if (latest != null && latest > Updater.Current)
                    {
                        newVersion = latest;
                        if (userAsked) InstallUpdate(latest);
                        else tray.ShowBalloonTip(5000, "✨ 커뮤니티 디톡스 새 버전 " + latest.ToString(3),
                            "트레이 아이콘을 열고 '보호 · 정보' 탭에서 '지금 업데이트'를 누르세요.", ToolTipIcon.Info);
                    }
                    else if (userAsked)
                    {
                        MessageBox.Show(this, error != null ? "업데이트를 확인하지 못했어요.\n인터넷 연결을 확인해 주세요.\n(" + error + ")"
                                                            : "이미 최신 버전이에요 (" + Updater.Current.ToString(3) + ") 🌿", Text);
                    }
                    dirty = true;
                }));
            });
        }

        private void InstallUpdate(Version version)
        {
            if (updating) return;
            if (MessageBox.Show(this, "새 버전 " + version.ToString(3) + "으로 업데이트할까요?\n잠깐 꺼졌다가 바로 다시 켜져요."
                                      + (Store.IsLocked ? "\n집중 디톡스는 그대로 이어져요." : ""), Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            updating = true;
            Render();
            System.Threading.Tasks.Task.Run(() =>
            {
                string error = null;
                try
                {
                    // Re-download right before installing so the newest file is used.
                    Updater.DownloadLatest();
                    Updater.Install();
                }
                catch (Exception e) { error = e.Message; Log.Write("update install: " + e); }
                BeginInvoke(new Action(() =>
                {
                    if (error != null)
                    {
                        updating = false;
                        MessageBox.Show(this, "업데이트하지 못했어요.\n(" + error + ")", Text);
                        Render();
                        return;
                    }
                    // The new version is starting; hand over without removing any blocking.
                    exiting = true;
                    blocker.Stop();
                    Guard.StopWatchdog();
                    tray.Visible = false;
                    Application.Exit();
                }));
            });
        }

        private void Uninstall()
        {
            if (Store.IsLocked) { LockedMessage(); return; }
            if (MessageBox.Show(this, "커뮤니티 디톡스를 제거할까요?\n모든 차단이 풀리고 설정과 기록이 지워져요.", Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            exiting = true;
            blocker.Stop();
            Guard.Uninstall();
            MessageBox.Show(this, "제거했어요. 이제 CommunityDetox.exe 파일을 지우면 끝이에요.\n그동안 수고 많았어요 🌿", Text);
            tray.Visible = false;
            Application.Exit();
        }

        private void LockedMessage() => MessageBox.Show(this, "집중 디톡스 중에는 뺄 수 없어요 🔒", Text);
    }
}
