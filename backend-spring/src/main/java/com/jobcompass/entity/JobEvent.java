package com.jobcompass.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "job_events")
public class JobEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "job_id")
    private Job job;

    private String fromStatus;
    @Column(nullable = false) private String toStatus;
    @Column(nullable = false) private LocalDateTime createdAt;

    protected JobEvent() {}

    public JobEvent(String fromStatus, String toStatus, LocalDateTime createdAt) {
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Job getJob() { return job; }
    public void setJob(Job job) { this.job = job; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
