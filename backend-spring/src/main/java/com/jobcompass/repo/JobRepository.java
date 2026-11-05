package com.jobcompass.repo;

import com.jobcompass.entity.Job;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;

public interface JobRepository extends JpaRepository<Job, Long>, JpaSpecificationExecutor<Job> {

    @Query("select count(distinct j.id) from Job j join j.events e where e.toStatus in ('interview','offer')")
    long countRespondedJobs();

    @Query("select j from Job j where lower(j.company) = lower(:company) "
            + "and (:role = '' or lower(j.role) like lower(concat('%', :role, '%')))")
    List<Job> findDuplicates(String company, String role, Pageable page);
}
