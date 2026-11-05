package com.jobcompass.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Single-row table (id = 1) holding the resume text. */
@Entity
@Table(name = "resume")
public class Resume {
    @Id
    private Integer id = 1;

    @Column(name = "text", nullable = false, columnDefinition = "text")
    private String text = "";

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { updatedAt = v; }
}
