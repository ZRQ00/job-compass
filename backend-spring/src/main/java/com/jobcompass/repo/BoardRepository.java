package com.jobcompass.repo;

import com.jobcompass.entity.Board;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardRepository extends JpaRepository<Board, Long> {
    List<Board> findAllByOrderByPositionAscIdAsc();
}
