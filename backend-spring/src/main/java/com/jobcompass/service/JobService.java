package com.jobcompass.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.dto.JobCreate;
import com.jobcompass.dto.JobDetailOut;
import com.jobcompass.dto.JobOut;
import com.jobcompass.entity.Job;
import com.jobcompass.entity.JobEvent;
import com.jobcompass.repo.JobRepository;
import com.jobcompass.web.ApiException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class JobService {

    public static final Set<String> STATUSES = Set.of("applied", "interview", "offer", "rejected", "withdrawn");

    private final JobRepository repo;
    private final ApplicationEventPublisher events;

    public JobService(JobRepository repo, ApplicationEventPublisher events) {
        this.repo = repo;
        this.events = events;
    }

    static LocalDateTime utcnow() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.strip();
    }

    @Transactional(readOnly = true)
    public List<Job> list(String status, String q) {
        if (status != null && !STATUSES.contains(status)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid status");
        }
        Specification<Job> spec = Specification.where(null);
        if (status != null) {
            spec = spec.and((r, cq, cb) -> cb.equal(r.get("status"), status));
        }
        if (q != null && !q.isBlank()) {
            String like = "%" + q.strip().toLowerCase() + "%";
            spec = spec.and((r, cq, cb) -> cb.or(
                    cb.like(cb.lower(r.get("company")), like),
                    cb.like(cb.lower(r.get("role")), like),
                    cb.like(cb.lower(cb.coalesce(r.<String>get("location"), "")), like),
                    cb.like(cb.lower(cb.coalesce(r.<String>get("notes"), "")), like)));
        }
        return repo.findAll(spec, Sort.by(Sort.Direction.DESC, "updatedAt"));
    }

    @Transactional(readOnly = true)
    public Job get(long id) {
        return repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Job not found"));
    }

    public Job create(JobCreate in) {
        String status = in.status() == null ? "applied" : in.status();
        if (!STATUSES.contains(status)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid status");
        }
        checkSalary(in.salaryMin(), in.salaryMax());

        LocalDateTime now = utcnow();
        Job j = new Job();
        j.setCompany(in.company().strip());
        j.setRole(in.role().strip());
        j.setLocation(blankToNull(in.location()));
        j.setDateApplied(in.dateApplied());
        j.setSalaryMin(in.salaryMin());
        j.setSalaryMax(in.salaryMax());
        j.setNotes(blankToNull(in.notes()));
        j.setJobDescription(blankToNull(in.jobDescription()));
        j.setJobUrl(blankToNull(in.jobUrl()));
        j.setCreatedAt(now);
        j.setUpdatedAt(now);
        j.setStatusChangedAt(now);
        applyStatus(j, null, status);
        Job saved = repo.save(j);
        if (saved.getJobDescription() != null) events.publishEvent(new JobDescriptionChanged(saved.getId()));
        return saved;
    }

    /** PATCH semantics: only keys present in the body change; explicit null clears. */
    public Job update(long id, ObjectNode body) {
        Job j = get(id);

        for (String key : List.of("company", "role")) {
            if (body.has(key)) {
                String v = body.get(key).isNull() ? null : body.get(key).asText();
                if (v == null || v.isBlank()) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, key + " can't be empty");
                }
                if (key.equals("company")) j.setCompany(v.strip()); else j.setRole(v.strip());
            }
        }
        if (body.has("location")) j.setLocation(blankToNull(text(body, "location")));
        if (body.has("notes")) j.setNotes(blankToNull(text(body, "notes")));
        if (body.has("job_url")) j.setJobUrl(blankToNull(text(body, "job_url")));
        if (body.has("date_applied")) {
            String d = blankToNull(text(body, "date_applied"));
            try {
                j.setDateApplied(d == null ? null : LocalDate.parse(d));
            } catch (Exception e) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "date_applied must be YYYY-MM-DD");
            }
        }
        if (body.has("salary_min")) j.setSalaryMin(intOrNull(body, "salary_min"));
        if (body.has("salary_max")) j.setSalaryMax(intOrNull(body, "salary_max"));
        checkSalary(j.getSalaryMin(), j.getSalaryMax());

        if (body.has("job_description")) {
            j.setJobDescription(blankToNull(text(body, "job_description")));
            j.clearMatch(); // the old match no longer describes this job
        }

        String newStatus = body.hasNonNull("status") ? body.get("status").asText() : null;
        if (newStatus != null) {
            if (!STATUSES.contains(newStatus)) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid status");
            }
            applyStatus(j, j.getStatus(), newStatus);
        }

        j.setUpdatedAt(utcnow());
        Job saved = repo.save(j);
        if (body.has("job_description")) events.publishEvent(new JobDescriptionChanged(saved.getId()));
        return saved;
    }

    // DTO-returning variants: events are lazy, so mapping must happen inside the transaction.
    @Transactional(readOnly = true)
    public JobDetailOut getDetail(long id) {
        return JobDetailOut.of(get(id));
    }

    public JobDetailOut createDetail(JobCreate in) {
        return JobDetailOut.of(create(in));
    }

    public JobDetailOut updateDetail(long id, ObjectNode body) {
        return JobDetailOut.of(update(id, body));
    }

    public JobOut saveMatch(long id, int score, String summary, String detailsJson) {
        Job j = get(id);
        j.setMatchScore(score);
        j.setMatchSummary(summary);
        j.setMatchDetails(detailsJson);
        j.setMatchedAt(utcnow());
        return JobOut.of(repo.save(j));
    }

    public void delete(long id) {
        repo.delete(get(id));
    }

    @Transactional(readOnly = true)
    public List<Job> duplicates(String company, String role) {
        return repo.findDuplicates(company.strip(), role == null ? "" : role.strip(), PageRequest.of(0, 5));
    }

    /** Single place that handles a status transition, including the first one. */
    private void applyStatus(Job j, String old, String next) {
        if (next.equals(old)) return;
        j.setStatus(next);
        j.setStatusChangedAt(utcnow());
        if (next.equals("applied") && j.getDateApplied() == null) {
            j.setDateApplied(LocalDate.now());
        }
        j.addEvent(new JobEvent(old, next, utcnow()));
    }

    private static void checkSalary(Integer min, Integer max) {
        if (min != null && max != null && min > max) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "salary_min can't be greater than salary_max");
        }
    }

    private static String text(JsonNode n, String key) {
        JsonNode v = n.get(key);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Integer intOrNull(JsonNode n, String key) {
        JsonNode v = n.get(key);
        if (v == null || v.isNull()) return null;
        if (!v.canConvertToInt() || v.asInt() < 0) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, key + " must be a non-negative integer");
        }
        return v.asInt();
    }
}
