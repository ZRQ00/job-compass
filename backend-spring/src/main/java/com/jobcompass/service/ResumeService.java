package com.jobcompass.service;

import com.jobcompass.entity.Resume;
import com.jobcompass.repo.ResumeRepository;
import com.jobcompass.web.ApiException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.apache.tika.Tika;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class ResumeService {

    public record ResumeOut(String text, LocalDateTime updatedAt) {
    }

    private final ResumeRepository repo;
    private final Tika tika = new Tika();

    private final ApplicationEventPublisher events;

    public ResumeService(ResumeRepository repo, ApplicationEventPublisher events) {
        this.repo = repo;
        this.events = events;
    }

    private Resume row() {
        return repo.findById(1).orElseGet(() -> {
            Resume r = new Resume();
            r.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
            return r;
        });
    }

    @Transactional(readOnly = true)
    public ResumeOut get() {
        Resume r = row();
        return new ResumeOut(r.getText(), r.getUpdatedAt());
    }

    @Transactional(readOnly = true)
    public String text() {
        return row().getText();
    }

    public ResumeOut save(String text) {
        Resume r = row();
        r.setText(text == null ? "" : text.strip());
        r.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
        repo.save(r);
        events.publishEvent(new ResumeChanged());
        return new ResumeOut(r.getText(), r.getUpdatedAt());
    }

    /** PDF, DOCX and TXT are all handled by Apache Tika. */
    public ResumeOut upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        String text;
        try (InputStream in = file.getInputStream()) {
            tika.setMaxStringLength(200_000);
            text = tika.parseToString(in);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Couldn't read that file");
        }
        if (text == null || text.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "No text found in that file");
        }
        return save(text);
    }
}
