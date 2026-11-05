package com.jobcompass.dto;

import com.jobcompass.entity.Board;

public record BoardOut(Long id, String name, String home, String search, int position, boolean builtin,
                       boolean hidden) {
    public static BoardOut of(Board b) {
        return new BoardOut(b.getId(), b.getName(), b.getHome(), b.getSearch(), b.getPosition(), b.isBuiltin(),
                b.isHidden());
    }
}
