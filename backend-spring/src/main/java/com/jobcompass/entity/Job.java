package com.jobcompass.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "jobs")
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false) private String company;
    @Column(nullable = false) private String role;
    private String location;
    private LocalDate dateApplied;
    private Integer salaryMin;
    private Integer salaryMax;
    @Column(columnDefinition = "text") private String notes;
    @Column(nullable = false) private String status;
    @Column(columnDefinition = "text") private String jobDescription;
    private String jobUrl;

    private Integer matchScore;
    @Column(columnDefinition = "text") private String matchSummary;
    @Column(columnDefinition = "text") private String matchDetails; // JSON text
    private LocalDateTime matchedAt;

    @Column(nullable = false) private LocalDateTime createdAt;
    @Column(nullable = false) private LocalDateTime updatedAt;
    @Column(nullable = false) private LocalDateTime statusChangedAt;

    @OneToMany(mappedBy = "job", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC, id ASC")
    private List<JobEvent> events = new ArrayList<>();

    public void addEvent(JobEvent e) {
        e.setJob(this);
        events.add(e);
    }

    public void clearMatch() {
        matchScore = null;
        matchSummary = null;
        matchDetails = null;
        matchedAt = null;
    }

    public Long getId() { return id; }
    public String getCompany() { return company; }
    public void setCompany(String v) { company = v; }
    public String getRole() { return role; }
    public void setRole(String v) { role = v; }
    public String getLocation() { return location; }
    public void setLocation(String v) { location = v; }
    public LocalDate getDateApplied() { return dateApplied; }
    public void setDateApplied(LocalDate v) { dateApplied = v; }
    public Integer getSalaryMin() { return salaryMin; }
    public void setSalaryMin(Integer v) { salaryMin = v; }
    public Integer getSalaryMax() { return salaryMax; }
    public void setSalaryMax(Integer v) { salaryMax = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { notes = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public String getJobDescription() { return jobDescription; }
    public void setJobDescription(String v) { jobDescription = v; }
    public String getJobUrl() { return jobUrl; }
    public void setJobUrl(String v) { jobUrl = v; }
    public Integer getMatchScore() { return matchScore; }
    public void setMatchScore(Integer v) { matchScore = v; }
    public String getMatchSummary() { return matchSummary; }
    public void setMatchSummary(String v) { matchSummary = v; }
    public String getMatchDetails() { return matchDetails; }
    public void setMatchDetails(String v) { matchDetails = v; }
    public LocalDateTime getMatchedAt() { return matchedAt; }
    public void setMatchedAt(LocalDateTime v) { matchedAt = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { updatedAt = v; }
    public LocalDateTime getStatusChangedAt() { return statusChangedAt; }
    public void setStatusChangedAt(LocalDateTime v) { statusChangedAt = v; }
    public List<JobEvent> getEvents() { return events; }
}
