package com.jobcompass.agent;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/** Blocks server-side request forgery from the agent's web tool: only public http(s) hosts are allowed. */
public final class UrlGuard {

    private UrlGuard() {}

    public static void check(URI uri) {
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Only http and https URLs are allowed");
        }
        if (uri.getHost() == null) throw new IllegalArgumentException("URL has no host");
        try {
            for (InetAddress a : InetAddress.getAllByName(uri.getHost())) {
                if (!isPublic(a)) throw new IllegalArgumentException("That address is not publicly reachable");
            }
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Couldn't resolve " + uri.getHost());
        }
    }

    public static boolean isPublic(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
                || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return false;
        }
        byte[] b = a.getAddress();
        if (b.length == 4 && (b[0] & 0xFF) == 100 && (b[1] & 0xC0) == 0x40) return false; // 100.64/10 (CGNAT, Tailscale)
        if (b.length == 16 && (b[0] & 0xFE) == 0xFC) return false;                         // fc00::/7 unique local
        return true;
    }
}
