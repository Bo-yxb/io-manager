package com.bo.io_manager.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "agent_assignments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentAssignment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Logical foreign key mappings below

    @Column(name = "agent_id", nullable = false)
    private String agentId;

    @Column(name = "target_type", nullable = false, length = 32)
    private String targetType; // e.g. PROJECT, TASK

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "role", length = 32)
    private String role; // e.g. MANAGER, WORKER, OBSERVER
    
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}