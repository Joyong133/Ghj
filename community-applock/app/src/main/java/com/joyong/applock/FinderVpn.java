package com.joyong.applock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Optional "find by connection": a local DNS-only VPN. Community names are answered with a sinkhole
 * address routed into this VPN; when an app connects to it, Android tells the VPN which app owns the
 * connection, and that app is locked (browsers, messengers and system apps excepted). The connection
 * is reset at once, so community sites don't load anywhere. Other lookups go to the real DNS server.
 */
public class FinderVpn extends VpnService implements Runnable {

    static final String ACTION_STOP = "com.joyong.applock.STOP";
    private static final String VPN_ADDRESS = "10.111.223.1";
    private static final String VPN_DNS = "10.111.223.2";
    private static final String SINKHOLE = "10.111.223.3";
    private static final byte[] SINKHOLE_IP = {10, 111, (byte) 223, 3};

    static volatile boolean running;

    private Thread thread;
    private ParcelFileDescriptor tun;
    private ExecutorService pool;
    private volatile List<InetAddress> upstream;
    private volatile long upstreamAt;
    private volatile String lastCommunity = "커뮤니티";
    private final Map<String, Long> seen = new HashMap<>();

    static boolean start(Context c) {
        if (VpnService.prepare(c) != null) return false;
        try {
            c.startForegroundService(new Intent(c, FinderVpn.class));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    static void stop(Context c) {
        try {
            c.startService(new Intent(c, FinderVpn.class).setAction(ACTION_STOP));
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
            thread = new Thread(this, "FinderVpn");
            thread.start();
        }
        return START_STICKY;
    }

    private void goForeground() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("finder", "커뮤니티 앱 찾기", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, "finder")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(getString(R.string.app_name))
                .setContentText("커뮤니티에 접속하는 앱을 찾고 있어요")
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE))
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1, n);
        } catch (RuntimeException ignored) {
        }
    }

    @Override
    public void onRevoke() {
        Store.setVpnOn(this, false); // switched off in Settings or replaced by another VPN
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
                    .addRoute(SINKHOLE, 32)
                    .setBlocking(true);
            try {
                b.addDisallowedApplication(getPackageName());
            } catch (Exception ignored) {
            }
            synchronized (this) {
                tun = b.establish();
            }
            if (tun == null) return;
            running = true;
            pool = Executors.newFixedThreadPool(4);
            FileInputStream in = new FileInputStream(tun.getFileDescriptor());
            FileOutputStream out = new FileOutputStream(tun.getFileDescriptor());
            byte[] buf = new byte[32767];
            while (running) {
                int len = in.read(buf);
                if (len <= 0) continue;
                int proto = DnsPacket.protocolTo(buf, len, SINKHOLE_IP);
                if (proto == 6 || proto == 17) {
                    byte[] packet = Arrays.copyOf(buf, len);
                    if (proto == 6 && DnsPacket.isTcpSyn(packet, len)) write(out, DnsPacket.tcpReset(packet, len));
                    try {
                        pool.execute(() -> identify(proto, packet));
                    } catch (RuntimeException ignored) {
                    }
                    continue;
                }
                String name = DnsPacket.queryName(buf, len);
                if (name == null) continue;
                byte[] packet = Arrays.copyOf(buf, len);
                String community = Store.communityOfHost(name);
                if (community != null) {
                    lastCommunity = community;
                    write(out, DnsPacket.sinkholeResponse(packet, len, SINKHOLE_IP));
                } else {
                    try {
                        pool.execute(() -> forward(out, packet));
                    } catch (RuntimeException ignored) {
                    }
                }
            }
        } catch (Exception e) {
            // closed or revoked
        } finally {
            if (Thread.currentThread() == thread) running = false;
        }
    }

    /** Which app made this connection? (Android tells the active VPN.) Lock it unless it's a browser etc. */
    private void identify(int proto, byte[] packet) {
        if (Build.VERSION.SDK_INT < 29) return;
        String key = proto + ":" + DnsPacket.srcPort(packet);
        long now = System.currentTimeMillis();
        synchronized (seen) {
            Long t = seen.get(key);
            if (t != null && now - t < 30_000) return;
            if (seen.size() > 500) seen.clear();
            seen.put(key, now);
        }
        int uid;
        try {
            InetSocketAddress local = new InetSocketAddress(
                    InetAddress.getByAddress(Arrays.copyOfRange(packet, 12, 16)), DnsPacket.srcPort(packet));
            InetSocketAddress remote = new InetSocketAddress(InetAddress.getByAddress(SINKHOLE_IP), DnsPacket.dstPort(packet));
            uid = ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).getConnectionOwnerUid(proto, local, remote);
        } catch (Exception e) {
            return;
        }
        if (uid < 10000) return;
        String[] pkgs = getPackageManager().getPackagesForUid(uid);
        if (pkgs == null) return;
        String community = lastCommunity;
        for (String pkg : pkgs) {
            if (Kinds.mayLock(this, pkg) && Store.lock(this, pkg, community, true)) {
                LockService.announce(this, pkg, community, true);
            }
        }
    }

    private void forward(FileOutputStream out, byte[] packet) {
        byte[] query = DnsPacket.dnsMessage(packet, packet.length);
        long now = System.currentTimeMillis();
        if (upstream == null || now - upstreamAt > 30_000) {
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
            }
        }
    }

    private synchronized void write(FileOutputStream out, byte[] packet) {
        try {
            if (tun != null) out.write(packet);
        } catch (IOException ignored) {
        }
    }

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
