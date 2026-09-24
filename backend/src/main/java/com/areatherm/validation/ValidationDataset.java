package com.areatherm.validation;

import com.areatherm.design.ShelterDesign;
import com.areatherm.project.Project;
import com.areatherm.security.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "validation_dataset")
@Getter
@Setter
@NoArgsConstructor
public class ValidationDataset {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id")
    private ShelterDesign shelterDesign;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by")
    private AppUser uploadedBy;

    @CreationTimestamp
    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private LocalDateTime uploadedAt;

    @Column(name = "mae_c", precision = 6, scale = 3)
    private BigDecimal maeC;

    @Column(name = "rmse_c", precision = 6, scale = 3)
    private BigDecimal rmseC;

    @Column(name = "mape_pct", precision = 6, scale = 3)
    private BigDecimal mapePct;

    @Column(name = "r2", precision = 6, scale = 4)
    private BigDecimal r2;
}
