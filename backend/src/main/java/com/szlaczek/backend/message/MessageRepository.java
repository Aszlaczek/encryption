package com.szlaczek.backend.message;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    /**
     * Indexed columns only; the list never needs the encrypted envelope, so this projection allows PostgreSQL to use an
     * index-only scan instead of loading {@code ciphertext}.
     */
    interface MessageListRow {

        UUID getId();

        Instant getCreatedAt();
    }

    Optional<Message> findByIdAndOwner_Id(UUID id, UUID ownerId);

    @Query(value = """
            select id as id, created_at as "createdAt"
            from messages
            where owner_id = :ownerId
            order by created_at desc, id desc
            limit :limit
            """, nativeQuery = true)
    List<MessageListRow> findFirstPage(@Param("ownerId") UUID ownerId, @Param("limit") int limit);

    /**
     * Row-value comparison matches the {@code (owner_id, created_at desc, id desc)} index directly; the equivalent OR
     * form makes PostgreSQL filter every newer index entry.
     */
    @Query(value = """
            select id as id, created_at as "createdAt"
            from messages
            where owner_id = :ownerId
              and (created_at, id) < (cast(:createdAt as timestamptz), cast(:id as uuid))
            order by created_at desc, id desc
            limit :limit
            """, nativeQuery = true)
    List<MessageListRow> findNextPage(
            @Param("ownerId") UUID ownerId,
            @Param("createdAt") Instant createdAt,
            @Param("id") UUID id,
            @Param("limit") int limit);

    @Modifying
    @Transactional
    @Query("delete from Message m where m.id = :id and m.owner.id = :ownerId")
    int deleteByIdAndOwner_Id(@Param("id") UUID id, @Param("ownerId") UUID ownerId);
}
