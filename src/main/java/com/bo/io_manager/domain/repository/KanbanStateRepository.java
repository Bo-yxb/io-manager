package com.bo.io_manager.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.bo.io_manager.domain.entity.KanbanState;

@Repository
public interface KanbanStateRepository extends JpaRepository<KanbanState, Long> {
}