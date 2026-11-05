package com.joyong.communitydetox;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app update: downloads the latest APK from the GitHub release and installs it with Android's
 * package installer — no browser, no file manager. The first update asks "update this app?" once;
 * on Android 12+ later updates can go through without asking (this app becomes the installer).
 */
final class AppUpdater {

    static final class Latest {
        final File file;
        final long versionCode;
        final String versionName;

        Latest(File file, long versionCode, String versionName) {
            this.file = file;
            this.versionCode = versionCode;
            this.versionName = versionName;
        }
    }

    static long currentVersionCode(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    static String currentVersionName(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
    }

    /** Downloads the latest APK (call off the main thread) and checks it really is this app. */
    static Latest download(Context c) throws IOException {
        File file = new File(c.getCacheDir(), "update.apk");
        HttpURLConnection conn = null;
        String url = BuildConfig.UPDATE_URL;
        // GitHub answers with redirects to its file server; follow them (https only).
        for (int hops = 0; hops < 5; hops++) {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "DigitalDetox-Updater");
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null || !next.startsWith("https://")) throw new IOException("bad redirect");
                url = next;
                continue;
            }
            if (code != 200) throw new IOException("HTTP " + code);
            break;
        }
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(file)) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } finally {
            conn.disconnect();
        }

        PackageInfo pi = c.getPackageManager().getPackageArchiveInfo(file.getPath(), 0);
        if (pi == null || !c.getPackageName().equals(pi.packageName)) {
            file.delete();
            throw new IOException("받은 파일이 이 앱이 아니에요");
        }
        long vc = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        return new Latest(file, vc, pi.versionName);
    }

    /** Hands the APK to the system installer. The result arrives in {@link UpdateReceiver}. */
    static void install(Context c, File apk) throws IOException {
        PackageInstaller installer = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) {
            // After the first self-update this app is the installer of record, so Android can skip the prompt.
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("app.apk", 0, apk.length())) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent result = PendingIntent.getBroadcast(c, 0, new Intent(c, UpdateReceiver.class), flags);
            session.commit(result.getIntentSender());
        }
    }

    /** Android asks once per installing app: "allow installing apps from this source?" */
    static boolean canInstall(Context c) {
        return c.getPackageManager().canRequestPackageInstalls();
    }

    private AppUpdater() {
    }
}
