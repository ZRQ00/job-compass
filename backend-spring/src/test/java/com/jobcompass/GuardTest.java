package com.jobcompass;

import static org.junit.jupiter.api.Assertions.*;

import com.jobcompass.agent.SqlGuard;
import com.jobcompass.agent.UrlGuard;
import java.net.InetAddress;
import java.net.URI;
import org.junit.jupiter.api.Test;

/** The agent's safety checks. Plain unit tests: no Docker needed. */
class GuardTest {

    @Test
    void sqlAllowsPlainSelects() {
        assertEquals("select * from jobs where status = 'applied'",
                SqlGuard.check("select * from jobs where status = 'applied';"));
        assertDoesNotThrow(() -> SqlGuard.check("WITH x AS (SELECT * FROM jobs) SELECT count(*) FROM x"));
        assertDoesNotThrow(() -> SqlGuard.check("select created_at, updated_at from jobs"));
    }

    @Test
    void sqlRejectsEverythingElse() {
        for (String bad : new String[] {
                "delete from jobs", "select 1; drop table jobs", "update jobs set status = 'offer'",
                "select pg_read_file('/etc/passwd')", "select * from jobs -- hi", "select /* x */ 1",
                "with d as (delete from jobs returning *) select * from d", "insert into jobs select * from jobs",
                "", "show all", "select lo_import('/etc/passwd')"}) {
            assertThrows(IllegalArgumentException.class, () -> SqlGuard.check(bad), bad);
        }
    }

    @Test
    void urlGuardBlocksPrivateAddresses() throws Exception {
        for (String ip : new String[] {"127.0.0.1", "10.0.0.5", "192.168.1.10", "172.16.0.1", "169.254.169.254",
                "100.64.0.1", "0.0.0.0", "::1", "fd00::1"}) {
            assertFalse(UrlGuard.isPublic(InetAddress.getByName(ip)), ip);
        }
        assertTrue(UrlGuard.isPublic(InetAddress.getByName("8.8.8.8")));
    }

    @Test
    void urlGuardRejectsBadSchemesAndLocalhost() {
        assertThrows(IllegalArgumentException.class, () -> UrlGuard.check(URI.create("file:///etc/passwd")));
        assertThrows(IllegalArgumentException.class, () -> UrlGuard.check(URI.create("http://localhost:11434/")));
        assertThrows(IllegalArgumentException.class, () -> UrlGuard.check(URI.create("http://127.0.0.1/")));
    }
}
