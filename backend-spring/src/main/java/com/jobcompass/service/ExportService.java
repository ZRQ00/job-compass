package com.jobcompass.service;

import com.jobcompass.entity.Job;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private static final String[] HEADERS = {"Company", "Role", "Location", "Status", "Date applied",
            "Salary min", "Salary max", "Job URL", "Notes"};

    private final JobService jobs;

    public ExportService(JobService jobs) {
        this.jobs = jobs;
    }

    private static String[] row(Job j) {
        return new String[] {j.getCompany(), j.getRole(), nz(j.getLocation()), j.getStatus(),
                j.getDateApplied() == null ? "" : j.getDateApplied().toString(),
                j.getSalaryMin() == null ? "" : j.getSalaryMin().toString(),
                j.getSalaryMax() == null ? "" : j.getSalaryMax().toString(),
                nz(j.getJobUrl()), nz(j.getNotes())};
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    public byte[] csv() {
        List<Job> all = jobs.list(null, null);
        StringBuilder sb = new StringBuilder("﻿"); // BOM so Excel opens it as UTF-8
        sb.append(String.join(",", HEADERS)).append("\r\n");
        for (Job j : all) {
            String[] r = row(j);
            for (int i = 0; i < r.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(escape(r[i]));
            }
            sb.append("\r\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static String escape(String v) {
        // Neutralise spreadsheet formulas in user-entered text.
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0 && !v.matches("-?\\d+(\\.\\d+)?")) v = "'" + v;
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    public byte[] xlsx() {
        List<Job> all = jobs.list(null, null);
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Jobs");
            Row head = sheet.createRow(0);
            for (int i = 0; i < HEADERS.length; i++) head.createCell(i).setCellValue(HEADERS[i]);
            int rowNum = 1;
            for (Job j : all) {
                Row r = sheet.createRow(rowNum++);
                String[] vals = row(j);
                for (int i = 0; i < vals.length; i++) {
                    // setCellValue(String) always writes a string cell, so formulas are never evaluated.
                    r.createCell(i).setCellValue(vals[i]);
                }
            }
            for (int i = 0; i < HEADERS.length; i++) sheet.autoSizeColumn(i);
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Couldn't build the spreadsheet", e);
        }
    }
}
