package com.jobcompass;

import static org.junit.jupiter.api.Assertions.*;

import com.jobcompass.service.BoardService;
import com.jobcompass.service.ExportService;
import com.jobcompass.web.ApiException;
import org.junit.jupiter.api.Test;

/** Plain unit tests: no Docker needed. */
class BoardDeriveTest {

    @Test
    void searchUrlBecomesTemplate() {
        String[] d = BoardService.derive("https://www.dice.com/jobs?q=JOBCOMPASS&location=JCLOC");
        assertEquals("https://www.dice.com/", d[0]);
        assertEquals("https://www.dice.com/jobs?q={query}&location={location}", d[1]);
    }

    @Test
    void plainUrlIsBookmark() {
        String[] d = BoardService.derive("https://builtin.com/jobs");
        assertEquals("https://builtin.com/jobs", d[0]);
        assertNull(d[1]);
    }

    @Test
    void rejectsNonHttp() {
        assertThrows(ApiException.class, () -> BoardService.derive("ftp://example.com"));
        assertThrows(ApiException.class, () -> BoardService.derive("not a url"));
    }

    @Test
    void csvEscapingAndFormulaGuard() {
        assertEquals("\"a,b\"", ExportService.escape("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", ExportService.escape("say \"hi\""));
        assertEquals("'=SUM(A1)", ExportService.escape("=SUM(A1)"));
        assertEquals("-5", ExportService.escape("-5"));
    }
}
