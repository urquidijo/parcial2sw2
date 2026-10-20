package com.proptech.contracts.repository;

import com.proptech.contracts.model.Appointment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, String> {
    List<Appointment> findByUserIdOrderByVisitDateDescVisitTimeAsc(String userId);
    List<Appointment> findAllByOrderByVisitDateDescVisitTimeAsc();
}
