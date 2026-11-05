using System.Security;

namespace CommunityDetox
{
    /// <summary>Task Scheduler definition (kept separate from Windows-only code so it can be tested anywhere).</summary>
    internal static class TaskXml
    {
        public static string Esc(string s) => SecurityElement.Escape(s);

        public static string Build(string userId, string exe, string description, string arguments, string triggers) =>
            "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n" +
            "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">" +
            "<RegistrationInfo><Description>" + Esc(description) + "</Description></RegistrationInfo>" +
            "<Triggers>" + triggers + "</Triggers>" +
            "<Principals><Principal id=\"Author\"><UserId>" + Esc(userId) + "</UserId>" +
            "<LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>" +
            "<Settings>" +
            "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>" +
            "<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>" +   // also start on battery
            "<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>" +
            "<AllowHardTerminate>false</AllowHardTerminate>" +
            "<StartWhenAvailable>true</StartWhenAvailable>" +
            "<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>" +
            "<IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>" +
            "<AllowStartOnDemand>true</AllowStartOnDemand>" +
            "<Enabled>true</Enabled><Hidden>false</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun>" +
            "<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>" +                    // never stop it (default: 3 days)
            "<Priority>4</Priority>" +                                           // normal priority (default: below normal)
            "<RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>" +
            "</Settings>" +
            "<Actions Context=\"Author\"><Exec><Command>" + Esc(exe) + "</Command><Arguments>" + Esc(arguments) + "</Arguments></Exec></Actions>" +
            "</Task>";
    }
}
