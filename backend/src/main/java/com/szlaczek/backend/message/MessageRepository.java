package com.szlaczek.backend.message;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    Optional<Message> findByIdAndOwner_Id(UUID id, UUID ownerId);

    List<Message> findByOwner_IdOrderByCreatedAtDescIdDesc(UUID ownerId, Pageable pageable);

    @Query("""
            select m from Message m
            where m.owner.id = :ownerId
              and (m.createdAt < :createdAt or (m.createdAt = :createdAt and m.id < :id))
            order by m.createdAt desc, m.id desc
            """)
    List<Message> findNextPage(
            @Param("ownerId") UUID ownerId,
            @Param("createdAt") Instant createdAt,
            @Param("id") UUID id,
            Pageable pageable);

    @Modifying
    @Transactional
    @Query("delete from Message m where m.id = :id and m.owner.id = :ownerId")
    int deleteByIdAndOwner_Id(@Param("id") UUID id, @Param("ownerId") UUID ownerId);
}
