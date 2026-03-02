package com.bo.io_manager.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.bo.io_manager.domain.entity.Project;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {
}