package com.szlaczek.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.szlaczek.backend.auth.AppUser;
import com.szlaczek.backend.auth.AppUserRepository;
import com.szlaczek.backend.message.Message;
import com.szlaczek.backend.message.MessageRepository;
import com.szlaczek.backend.message.MessageRepository.MessageListRow;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest
class PersistenceIntegrationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Flyway flyway;

    @Autowired
    private AppUserRepository appUsers;

    @Autowired
    private MessageRepository messages;

    @Value("${spring.jpa.hibernate.ddl-auto}")
    private String ddlAuto;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.execute("delete from messages");
        jdbcTemplate.execute("delete from app_users");
    }

    @Test
    void migrationsCreateSchemaAndValidateEntityMappings() {
        assertThat(ddlAuto).isEqualTo("validate");

        assertThat(jdbcTemplate.queryForList(
                "select table_name from information_schema.tables "
                        + "where table_schema = 'public' order by table_name",
                String.class))
                .containsExactly("app_users", "flyway_schema_history", "messages");

        assertThat(jdbcTemplate.queryForList(
                "select indexname from pg_indexes "
                        + "where schemaname = 'public' and tablename = 'messages'",
                String.class))
                .contains("idx_messages_owner_created_id");

        assertThat(jdbcTemplate.queryForList(
                "select conname from pg_constraint where connamespace = 'public'::regnamespace",
                String.class))
                .contains(
                        "app_users_username_unique",
                        "messages_owner_fk",
                        "messages_nonce_length",
                        "messages_ciphertext_length",
                        "messages_tag_length");

        assertThat(jdbcTemplate.queryForObject("select count(*) from flyway_schema_history", Integer.class))
                .isEqualTo(3);
    }

    @Test
    void repeatedMigrationDoesNotChangeSchema() {
        List<String> schemaBefore = schemaFingerprint();

        MigrateResult result = flyway.migrate();

        assertThat(result.migrationsExecuted).isZero();
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.info().applied()).hasSize(3);
        assertThat(schemaFingerprint()).isEqualTo(schemaBefore);
        flyway.validate();
    }

    @Test
    void usernameUniqueConstraintIsEnforced() {
        insertUser("alice");

        assertSqlState(() -> insertUser("alice"), "23505");
    }

    @Test
    void ownerForeignKeyIsEnforcedAndCascades() {
        assertSqlState(
                () -> insertMessage(UUID.randomUUID(), bytes(12), bytes(1), bytes(16)), "23503");

        AppUser owner = appUsers.saveAndFlush(new AppUser("alice", "hash-alice"));
        insertMessage(owner.getId(), bytes(12), bytes(1), bytes(16));

        jdbcTemplate.update("delete from app_users where id = ?", owner.getId());

        assertThat(jdbcTemplate.queryForObject("select count(*) from messages", Integer.class))
                .isZero();
    }

    @Test
    void nonceTagAndCiphertextConstraintsAreEnforced() {
        AppUser owner = appUsers.saveAndFlush(new AppUser("alice", "hash-alice"));

        assertSqlState(() -> insertMessage(owner.getId(), bytes(11), bytes(1), bytes(16)), "23514");
        assertSqlState(() -> insertMessage(owner.getId(), bytes(13), bytes(1), bytes(16)), "23514");
        assertSqlState(() -> insertMessage(owner.getId(), bytes(12), bytes(1), bytes(15)), "23514");
        assertSqlState(() -> insertMessage(owner.getId(), bytes(12), bytes(1), bytes(17)), "23514");
        assertSqlState(() -> insertMessage(owner.getId(), bytes(12), bytes(0), bytes(16)), "23514");
        assertSqlState(() -> insertMessage(owner.getId(), bytes(12), bytes(40001), bytes(16)), "23514");

        assertThat(insertMessage(owner.getId(), bytes(12), bytes(1), bytes(16)))
                .isEqualTo(1);
    }

    @Test
    void repositoriesPersistAndScopeDataByOwner() {
        AppUser alice = appUsers.saveAndFlush(new AppUser("alice", "hash-alice"));
        AppUser bob = appUsers.saveAndFlush(new AppUser("bob", "hash-bob"));

        assertThat(alice.getId()).isNotNull();
        assertThat(alice.getCreatedAt()).isNotNull();
        assertThat(alice.isEnabled()).isTrue();
        assertThat(appUsers.findByUsername("alice")).isPresent();
        assertThat(appUsers.existsByUsername("alice")).isTrue();
        assertThat(appUsers.existsByUsername("carol")).isFalse();

        Message message = messages.saveAndFlush(
                new Message(alice, "k1", bytes(12), "tajne".getBytes(), bytes(16)));

        assertThat(message.getId()).isNotNull();
        assertThat(message.getCreatedAt()).isNotNull();
        assertThat(message.getFormatVersion()).isEqualTo((short) 1);
        assertThat(message.getAlgorithm()).isEqualTo("AES-256-GCM");
        assertThat(message.getOwner().getId()).isEqualTo(alice.getId());

        Instant persistedCreatedAt = jdbcTemplate
                .queryForObject("select created_at from messages where id = ?", Timestamp.class, message.getId())
                .toInstant();
        assertThat(message.getCreatedAt()).isEqualTo(persistedCreatedAt);

        assertThat(messages.findByIdAndOwner_Id(message.getId(), alice.getId())).isPresent();
        assertThat(messages.findByIdAndOwner_Id(message.getId(), bob.getId())).isEmpty();
        assertThat(messages.findFirstPage(bob.getId(), 10)).isEmpty();

        assertThat(messages.deleteByIdAndOwner_Id(message.getId(), bob.getId())).isZero();
        assertThat(messages.findByIdAndOwner_Id(message.getId(), alice.getId())).isPresent();
        assertThat(messages.deleteByIdAndOwner_Id(message.getId(), alice.getId())).isEqualTo(1);
        assertThat(messages.findByIdAndOwner_Id(message.getId(), alice.getId())).isEmpty();
    }

    @Test
    void cursorPaginationUsesCreatedAtAndId() {
        AppUser alice = appUsers.saveAndFlush(new AppUser("alice", "hash-alice"));
        Message oldest = messages.saveAndFlush(
                new Message(alice, "k1", bytes(12), bytes(1), bytes(16)));
        Message middle = messages.saveAndFlush(
                new Message(alice, "k1", bytes(12), bytes(2), bytes(16)));
        Message newest = messages.saveAndFlush(
                new Message(alice, "k1", bytes(12), bytes(3), bytes(16)));

        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        updateCreatedAt(oldest, base);
        updateCreatedAt(middle, base.plusSeconds(1));
        updateCreatedAt(newest, base.plusSeconds(2));

        List<MessageListRow> firstPage = messages.findFirstPage(alice.getId(), 2);

        assertThat(firstPage).extracting(MessageListRow::getId).containsExactly(newest.getId(), middle.getId());

        MessageListRow lastOfFirstPage = firstPage.get(1);
        List<MessageListRow> secondPage = messages.findNextPage(
                alice.getId(), lastOfFirstPage.getCreatedAt(), lastOfFirstPage.getId(), 2);

        assertThat(secondPage).extracting(MessageListRow::getId).containsExactly(oldest.getId());

        MessageListRow oldestReloaded = secondPage.get(0);
        assertThat(messages.findNextPage(
                alice.getId(), oldestReloaded.getCreatedAt(), oldestReloaded.getId(), 2))
                .isEmpty();
    }

    private void insertUser(String username) {
        jdbcTemplate.update(
                "insert into app_users (username, password_hash) values (?, ?)", username, "hash-" + username);
    }

    private int insertMessage(UUID ownerId, byte[] nonce, byte[] ciphertext, byte[] tag) {
        return jdbcTemplate.update(
                "insert into messages (owner_id, nonce, ciphertext, tag, key_id) values (?, ?, ?, ?, ?)",
                ownerId,
                nonce,
                ciphertext,
                tag,
                "k1");
    }

    private void updateCreatedAt(Message message, Instant createdAt) {
        jdbcTemplate.update(
                "update messages set created_at = ? where id = ?", Timestamp.from(createdAt), message.getId());
    }

    private List<String> schemaFingerprint() {
        List<String> fingerprint = new ArrayList<>();

        fingerprint.addAll(jdbcTemplate.queryForList(
                """
                        select 'column:' || table_name || '.' || column_name || ':' || data_type
                               || ':' || is_nullable || ':' || coalesce(column_default, '')
                        from information_schema.columns
                        where table_schema = 'public'
                        order by table_name, column_name
                        """,
                String.class));

        fingerprint.addAll(jdbcTemplate.queryForList(
                """
                        select 'index:' || indexname || ':' || indexdef
                        from pg_indexes
                        where schemaname = 'public'
                        order by indexname
                        """,
                String.class));

        fingerprint.addAll(jdbcTemplate.queryForList(
                """
                        select 'constraint:' || conname || ':' || pg_get_constraintdef(oid)
                        from pg_constraint
                        where connamespace = 'public'::regnamespace
                        order by conname
                        """,
                String.class));

        return fingerprint;
    }

    private static byte[] bytes(int length) {
        byte[] value = new byte[length];
        Arrays.fill(value, (byte) 0x2a);
        return value;
    }

    private static void assertSqlState(ThrowingCallable callable, String expectedSqlState) {
        assertThatThrownBy(callable)
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(exception -> {
                    Throwable rootCause = exception;
                    while (rootCause.getCause() != null) {
                        rootCause = rootCause.getCause();
                    }

                    assertThat(rootCause).isInstanceOf(SQLException.class);
                    assertThat(((SQLException) rootCause).getSQLState()).isEqualTo(expectedSqlState);
                });
    }
}
