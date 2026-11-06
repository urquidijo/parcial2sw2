package com.proptech.contracts.repository;

import com.proptech.contracts.model.MonitorReport;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MonitorReportRepository extends JpaRepository<MonitorReport, Long> {
    List<MonitorReport> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
