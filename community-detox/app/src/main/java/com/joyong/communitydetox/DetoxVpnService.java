package com.joyong.communitydetox;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Network-level blocking that works in every app (VR browsers, KakaoTalk's in-app browser, ...).
 * It is a local "VPN" that only carries DNS: the device's DNS server is set to a private address
 * routed into this service. Queries for blocked communities are answered "no such domain";
 * everything else is forwarded to the real DNS server. No other traffic passes through it,
 * and nothing leaves the device except the forwarded DNS queries.
 */
public class DetoxVpnService extends VpnService implements Runnable {

    static final String ACTION_STOP = "com.joyong.communitydetox.STOP_VPN";
    private static final String VPN_ADDRESS = "10.111.222.1";
    private static final String VPN_DNS = "10.111.222.2";

    static volatile boolean running;

    private Thread thread;
    private ParcelFileDescriptor tun;
    private ExecutorService pool;
    private volatile Prefs.Rules rules = new Prefs.Rules();
    private final java.util.Map<String, Long> lastCounted = new java.util.HashMap<>();
    private volatile List<InetAddress> upstream;
    private volatile long upstreamAt;

    private final SharedPreferences.OnSharedPreferenceChangeListener prefsListener = (sp, key) -> refresh();

    /** Starts the VPN if the user already allowed it. Returns false if permission is needed first. */
    static boolean start(Context c) {
        if (VpnService.prepare(c) != null) return false;
        try {
            // Foreground service: keeps blocking on even when the app is closed (and works from boot).
            c.startForegroundService(new Intent(c, DetoxVpnService.class));
            return true;
        } catch (RuntimeException e) {
            try {
                c.startService(new Intent(c, DetoxVpnService.class));
                return true;
            } catch (RuntimeException e2) {
                return false;
            }
        }
    }

    private static final int NOTIFICATION_ID = 7;

    private void goForeground() {
        android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
        nm.createNotificationChannel(new android.app.NotificationChannel(
                "detox_vpn", "커뮤니티 차단", android.app.NotificationManager.IMPORTANCE_LOW));
        android.app.Notification n = new android.app.Notification.Builder(this, "detox_vpn")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(getString(R.string.app_name))
                .setContentText("커뮤니티 사이트를 막고 있어요 🌿")
                .setOngoing(true)
                .setContentIntent(android.app.PendingIntent.getActivity(this, 0,
                        new Intent(this, MainActivity.class), android.app.PendingIntent.FLAG_IMMUTABLE))
                .build();
        try {
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (RuntimeException ignored) {
            // still works as a plain VPN service
        }
    }

    static void stop(Context c) {
        try {
            c.startService(new Intent(c, DetoxVpnService.class).setAction(ACTION_STOP));
        } catch (RuntimeException ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdown();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        goForeground();
        if (thread == null || !thread.isAlive()) {
            refresh();
            Prefs.sp(this).registerOnSharedPreferenceChangeListener(prefsListener);
            thread = new Thread(this, "DetoxVpn");
            thread.start();
        }
        return START_STICKY;
    }

    private void refresh() {
        rules = Prefs.rules(this);
    }

    @Override
    public void onRevoke() {
        // Switched off from system settings or replaced by another VPN. Outside a focus lock that is the
        // user's choice, so remember it; during a lock it stays "on" and the blocking service restarts it.
        if (!Prefs.isLocked(this)) Prefs.setVpnOn(this, false);
        shutdown();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    private synchronized void shutdown() {
        running = false;
        Prefs.sp(this).unregisterOnSharedPreferenceChangeListener(prefsListener);
        if (pool != null) pool.shutdownNow();
        try {
            if (tun != null) tun.close();
        } catch (IOException ignored) {
        }
        tun = null;
        if (thread != null) thread.interrupt();
    }

    @Override
    public void run() {
        try {
            Builder b = new Builder()
                    .setSession(getString(R.string.app_name))
                    .addAddress(VPN_ADDRESS, 32)
                    .addDnsServer(VPN_DNS)
                    .addRoute(VPN_DNS, 32)
                    .setBlocking(true);
            try {
                // This app is exempt: our own DNS forwarding goes out directly, and 모아읽기 can read
                // the boards that browsers can't.
                b.addDisallowedApplication(getPackageName());
            } catch (Exception ignored) {
            }
            synchronized (this) {
                tun = b.establish();
            }
            if (tun == null) return; // permission was revoked
            running = true;
            pool = Executors.newFixedThreadPool(4);

            FileInputStream in = new FileInputStream(tun.getFileDescriptor());
            FileOutputStream out = new FileOutputStream(tun.getFileDescriptor());
            byte[] buf = new byte[32767];
            while (running) {
                int len = in.read(buf);
                if (len <= 0) continue;
                String name = DnsPacket.queryName(buf, len);
                if (name == null) continue;
                byte[] packet = java.util.Arrays.copyOf(buf, len);
                // Checked per query: a pause or lock can start / end at any moment.
                String hit = Prefs.isBlockingActive(this) ? rules.matchHost(name) : null;
                if (hit != null) {
                    countOnce(hit);
                    write(out, DnsPacket.blockedResponse(packet, len));
                } else {
                    try {
                        pool.execute(() -> forward(out, packet));
                    } catch (RuntimeException ignored) {
                        // shutting down
                    }
                }
            }
        } catch (Exception e) {
            // closed or revoked
        } finally {
            if (Thread.currentThread() == thread) running = false; // a restart may already run a new loop
        }
    }

    /** One visit makes several lookups (IPv4, IPv6, HTTPS records); count it once per 30 seconds. */
    private void countOnce(String domain) {
        long now = System.currentTimeMillis();
        synchronized (lastCounted) {
            Long last = lastCounted.get(domain);
            if (last != null && now - last < 30_000) return;
            lastCounted.put(domain, now);
        }
        Prefs.recordBlock(this);
    }

    private void forward(FileOutputStream out, byte[] packet) {
        byte[] query = DnsPacket.dnsMessage(packet, packet.length);
        long now = System.currentTimeMillis();
        if (upstream == null || now - upstreamAt > 30_000) { // the real network may have changed (Wi-Fi <-> mobile)
            upstream = upstreamDns();
            upstreamAt = now;
        }
        for (InetAddress server : upstream) {
            try (DatagramSocket s = new DatagramSocket()) {
                protect(s);
                s.setSoTimeout(4000);
                s.send(new DatagramPacket(query, query.length, server, 53));
                byte[] resp = new byte[4096];
                DatagramPacket p = new DatagramPacket(resp, resp.length);
                s.receive(p);
                write(out, DnsPacket.wrapResponse(packet, resp, p.getLength()));
                return;
            } catch (IOException ignored) {
                // try the next server
            }
        }
    }

    private synchronized void write(FileOutputStream out, byte[] packet) {
        try {
            if (tun != null) out.write(packet);
        } catch (IOException ignored) {
        }
    }

    /** DNS servers of the real (non-VPN) network, with public resolvers as a fallback. */
    private List<InetAddress> upstreamDns() {
        List<InetAddress> list = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps == null || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                        || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (InetAddress a : lp.getDnsServers()) {
                    if (a instanceof Inet4Address && !list.contains(a)) list.add(a);
                }
            }
        } catch (RuntimeException ignored) {
        }
        try {
            list.add(InetAddress.getByName("1.1.1.1"));
            list.add(InetAddress.getByName("8.8.8.8"));
        } catch (IOException ignored) {
        }
        return list;
    }
}
