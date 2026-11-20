package com.joyong.applock;

import java.util.Locale;

/**
 * Minimal IPv4 / UDP / DNS packet handling for the DNS-filtering VPN.
 * Only DNS queries sent to the VPN's own DNS address ever reach the VPN, so this only has to
 * read one question and build answers. Pure Java, no Android types, so it can be unit-tested.
 */
final class DnsPacket {

    static final int IP_HEADER = 20;   // we only build headers without options
    static final int UDP_HEADER = 8;

    /** Offset of the DNS message inside the IP packet, or -1 if this is not an IPv4/UDP packet to port 53. */
    static int dnsOffset(byte[] p, int len) {
        if (len < IP_HEADER + UDP_HEADER + 12) return -1;
        if ((p[0] >> 4 & 0xF) != 4) return -1;            // IPv4
        int ihl = (p[0] & 0xF) * 4;
        if (ihl < IP_HEADER || len < ihl + UDP_HEADER + 12) return -1;
        if ((p[9] & 0xFF) != 17) return -1;               // UDP
        int dstPort = u16(p, ihl + 2);
        if (dstPort != 53) return -1;
        return ihl + UDP_HEADER;
    }

    /** The queried name ("gall.dcinside.com"), or null if the packet can't be read. */
    static String queryName(byte[] p, int len) {
        int dns = dnsOffset(p, len);
        if (dns < 0) return null;
        if (u16(p, dns + 4) < 1) return null;              // QDCOUNT
        StringBuilder sb = new StringBuilder();
        int i = dns + 12;
        while (i < len) {
            int l = p[i] & 0xFF;
            if (l == 0) return sb.toString().toLowerCase(Locale.ROOT);
            if ((l & 0xC0) != 0 || i + 1 + l > len || sb.length() > 253) return null; // no pointers in a question
            if (sb.length() > 0) sb.append('.');
            for (int k = 0; k < l; k++) sb.append((char) (p[i + 1 + k] & 0xFF));
            i += 1 + l;
        }
        return null;
    }

    /** End of the first question (after QTYPE and QCLASS), relative to the start of the IP packet. */
    private static int questionEnd(byte[] p, int len) {
        int i = dnsOffset(p, len) + 12;
        while (i < len && (p[i] & 0xFF) != 0) i += 1 + (p[i] & 0xFF);
        return i + 1 + 4;
    }

    /** A "no such domain" answer to the query, as a complete IP packet ready to write to the VPN. */
    static byte[] blockedResponse(byte[] p, int len) {
        int dns = dnsOffset(p, len);
        int end = Math.min(questionEnd(p, len), len);
        byte[] msg = new byte[end - dns];
        System.arraycopy(p, dns, msg, 0, msg.length);
        msg[2] = (byte) (0x80 | (msg[2] & 0x79));           // QR=1, keep opcode + RD
        msg[3] = (byte) 0x83;                               // RA=1, RCODE=3 (NXDOMAIN)
        msg[4] = 0; msg[5] = 1;                             // QDCOUNT=1
        msg[6] = msg[7] = msg[8] = msg[9] = msg[10] = msg[11] = 0; // AN/NS/AR = 0
        return wrapResponse(p, msg, msg.length);
    }

    /** Query type of the first question (1 = A, 28 = AAAA, 65 = HTTPS ...), or -1. */
    static int queryType(byte[] p, int len) {
        int end = questionEnd(p, len);
        return end <= len ? u16(p, end - 4) : -1;
    }

    /**
     * Answer for a blocked name that points to {@code sinkhole} (an address routed into the VPN), so the
     * app that then tries to connect can be identified. A queries get that address; other types get
     * "no records" (so nothing goes around it over IPv6).
     */
    static byte[] sinkholeResponse(byte[] p, int len, byte[] sinkhole) {
        int dns = dnsOffset(p, len);
        int end = Math.min(questionEnd(p, len), len);
        boolean a = queryType(p, len) == 1;
        int qlen = end - dns;
        byte[] msg = new byte[qlen + (a ? 16 : 0)];
        System.arraycopy(p, dns, msg, 0, qlen);
        msg[2] = (byte) (0x80 | (msg[2] & 0x79));           // QR=1, keep opcode + RD
        msg[3] = (byte) 0x80;                               // RA=1, RCODE=0
        msg[4] = 0; msg[5] = 1;                             // QDCOUNT=1
        msg[6] = 0; msg[7] = (byte) (a ? 1 : 0);            // ANCOUNT
        msg[8] = msg[9] = msg[10] = msg[11] = 0;
        if (a) {
            int o = qlen;
            msg[o] = (byte) 0xC0; msg[o + 1] = 12;          // name: pointer to the question
            put16(msg, o + 2, 1);                           // type A
            put16(msg, o + 4, 1);                           // class IN
            msg[o + 6] = 0; msg[o + 7] = 0; put16(msg, o + 8, 30); // TTL 30 s (pauses take effect quickly)
            put16(msg, o + 10, 4);
            System.arraycopy(sinkhole, 0, msg, o + 12, 4);
        }
        return wrapResponse(p, msg, msg.length);
    }

    // ---- packets sent to the sinkhole address (an app trying to connect to a blocked site) ----

    /** IP protocol (6 TCP, 17 UDP) if this IPv4 packet goes to {@code dst}, else -1. */
    static int protocolTo(byte[] p, int len, byte[] dst) {
        if (len < IP_HEADER + 8 || (p[0] >> 4 & 0xF) != 4) return -1;
        for (int i = 0; i < 4; i++) if (p[16 + i] != dst[i]) return -1;
        return p[9] & 0xFF;
    }

    static int srcPort(byte[] p) {
        return u16(p, (p[0] & 0xF) * 4);
    }

    static int dstPort(byte[] p) {
        return u16(p, (p[0] & 0xF) * 4 + 2);
    }

    /** True for a TCP SYN (a new connection), not for later packets of it. */
    static boolean isTcpSyn(byte[] p, int len) {
        int ihl = (p[0] & 0xF) * 4;
        return len >= ihl + 20 && (p[ihl + 13] & 0x02) != 0 && (p[ihl + 13] & 0x10) == 0;
    }

    /** A TCP reset answering a SYN, so the app's connection fails at once instead of hanging. */
    static byte[] tcpReset(byte[] p, int len) {
        int ihl = (p[0] & 0xF) * 4;
        byte[] r = new byte[IP_HEADER + 20];
        r[0] = 0x45;
        put16(r, 2, r.length);
        r[8] = 64;
        r[9] = 6;
        System.arraycopy(p, 16, r, 12, 4);
        System.arraycopy(p, 12, r, 16, 4);
        put16(r, 10, checksum(r, 0, IP_HEADER));
        int t = IP_HEADER;
        put16(r, t, u16(p, ihl + 2));                       // from the port it tried
        put16(r, t + 2, u16(p, ihl));                       // to the app's port
        long seq = ((long) (p[ihl + 4] & 0xFF) << 24) | ((p[ihl + 5] & 0xFF) << 16) | ((p[ihl + 6] & 0xFF) << 8) | (p[ihl + 7] & 0xFF);
        long ack = (seq + 1) & 0xFFFFFFFFL;
        r[t + 8] = (byte) (ack >> 24); r[t + 9] = (byte) (ack >> 16); r[t + 10] = (byte) (ack >> 8); r[t + 11] = (byte) ack;
        r[t + 12] = 0x50;                                   // 20-byte header
        r[t + 13] = 0x14;                                   // RST + ACK
        // checksum over pseudo header + TCP header
        byte[] ph = new byte[12 + 20];
        System.arraycopy(r, 12, ph, 0, 8);
        ph[9] = 6;
        put16(ph, 10, 20);
        System.arraycopy(r, t, ph, 12, 20);
        put16(r, t + 16, checksum(ph, 0, ph.length));
        return r;
    }

    /** The DNS message from the query (to forward upstream). */
    static byte[] dnsMessage(byte[] p, int len) {
        int dns = dnsOffset(p, len);
        byte[] msg = new byte[len - dns];
        System.arraycopy(p, dns, msg, 0, msg.length);
        return msg;
    }

    /** Wraps a DNS answer in IPv4 + UDP headers addressed back to whoever sent the query. */
    static byte[] wrapResponse(byte[] query, byte[] dns, int dnsLen) {
        int ihl = (query[0] & 0xF) * 4;
        int total = IP_HEADER + UDP_HEADER + dnsLen;
        byte[] r = new byte[total];
        r[0] = 0x45;                                         // IPv4, 20-byte header
        put16(r, 2, total);
        put16(r, 6, 0x4000);                                 // don't fragment
        r[8] = 64;                                           // TTL
        r[9] = 17;                                           // UDP
        System.arraycopy(query, 16, r, 12, 4);               // src = original destination
        System.arraycopy(query, 12, r, 16, 4);               // dst = original source
        put16(r, 10, checksum(r, 0, IP_HEADER));
        put16(r, IP_HEADER, u16(query, ihl + 2));            // src port = 53
        put16(r, IP_HEADER + 2, u16(query, ihl));            // dst port = client's port
        put16(r, IP_HEADER + 4, UDP_HEADER + dnsLen);
        // UDP checksum 0 = "not computed", allowed for IPv4
        System.arraycopy(dns, 0, r, IP_HEADER + UDP_HEADER, dnsLen);
        return r;
    }

    static int checksum(byte[] b, int off, int len) {
        long sum = 0;
        for (int i = 0; i < len; i += 2) {
            int hi = b[off + i] & 0xFF;
            int lo = i + 1 < len ? b[off + i + 1] & 0xFF : 0;
            sum += (hi << 8) | lo;
        }
        while ((sum >> 16) != 0) sum = (sum & 0xFFFF) + (sum >> 16);
        return (int) (~sum & 0xFFFF);
    }

    static int u16(byte[] b, int i) {
        return ((b[i] & 0xFF) << 8) | (b[i + 1] & 0xFF);
    }

    private static void put16(byte[] b, int i, int v) {
        b[i] = (byte) (v >> 8);
        b[i + 1] = (byte) v;
    }

    private DnsPacket() {
    }
}
