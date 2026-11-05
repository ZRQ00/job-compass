package com.jobcompass.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "boards")
public class Board {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false) private String name;
    @Column(nullable = false) private String home;
    private String search;
    @Column(nullable = false) private int position;
    @Column(nullable = false) private boolean builtin;
    @Column(nullable = false) private boolean hidden;

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String v) { name = v; }
    public String getHome() { return home; }
    public void setHome(String v) { home = v; }
    public String getSearch() { return search; }
    public void setSearch(String v) { search = v; }
    public int getPosition() { return position; }
    public void setPosition(int v) { position = v; }
    public boolean isBuiltin() { return builtin; }
    public void setBuiltin(boolean v) { builtin = v; }
    public boolean isHidden() { return hidden; }
    public void setHidden(boolean v) { hidden = v; }
}
