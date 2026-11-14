package com.szlaczek.backend.message;

import com.szlaczek.backend.auth.AppUser;
import com.szlaczek.backend.auth.AppUserRepository;
import com.szlaczek.backend.crypto.CryptoException;
import com.szlaczek.backend.crypto.CryptoService;
import com.szlaczek.backend.crypto.EncryptedPayload;
import com.szlaczek.backend.crypto.PackageCodec;
import com.szlaczek.backend.message.api.CreateMessageRequest;
import com.szlaczek.backend.message.api.MessagePageResponse;
import com.szlaczek.backend.message.api.MessageResponse;
import com.szlaczek.backend.message.api.MessageSummary;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owner-scoped persistence and package operations for messages. */
@Service
public class MessageService {

    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int MAX_PAGE_SIZE = 50;

    private final MessageRepository messageRepository;
    private final AppUserRepository appUserRepository;
    private final CryptoService cryptoService;
    private final PackageCodec packageCodec;

    public MessageService(
            MessageRepository messageRepository,
            AppUserRepository appUserRepository,
            CryptoService cryptoService,
            PackageCodec packageCodec) {
        this.messageRepository = messageRepository;
        this.appUserRepository = appUserRepository;
        this.cryptoService = cryptoService;
        this.packageCodec = packageCodec;
    }

    @Transactional
    public MessageResponse create(CreateMessageRequest request, UUID ownerId) {
        AppUser owner = appUserRepository.findById(ownerId).orElseThrow();
        EncryptedPayload envelope = cryptoService.encrypt(request.plaintext(), ownerId);
        Message saved = messageRepository.saveAndFlush(new Message(
                owner, envelope.keyId(), envelope.nonce(), envelope.ciphertext(), envelope.tag()));
        return response(saved);
    }

    @Transactional(readOnly = true)
    public MessagePageResponse list(UUID ownerId, int requestedLimit, String cursorValue) {
        int limit = requestedLimit <= 0 ? DEFAULT_PAGE_SIZE : Math.min(requestedLimit, MAX_PAGE_SIZE);
        MessageCursor cursor = cursorValue == null ? null : MessageCursor.decode(cursorValue);
        PageRequest page = PageRequest.of(0, limit + 1);
        List<Message> rows = cursor == null
                ? messageRepository.findByOwner_IdOrderByCreatedAtDescIdDesc(ownerId, page)
                : messageRepository.findNextPage(ownerId, cursor.createdAt(), cursor.id(), page);
        boolean hasMore = rows.size() > limit;
        List<Message> visible = hasMore ? rows.subList(0, limit) : rows;
        List<MessageSummary> items = visible.stream()
                .map(message -> new MessageSummary(message.getId(), message.getCreatedAt())).toList();
        String nextCursor = hasMore && !visible.isEmpty()
                ? new MessageCursor(visible.get(visible.size() - 1).getCreatedAt(),
                        visible.get(visible.size() - 1).getId()).encode()
                : null;
        return new MessagePageResponse(items, nextCursor, hasMore);
    }

    @Transactional(readOnly = true)
    public MessageResponse get(UUID id, UUID ownerId) {
        return response(find(id, ownerId));
    }

    @Transactional
    public void delete(UUID id, UUID ownerId) {
        if (messageRepository.deleteByIdAndOwner_Id(id, ownerId) == 0) {
            throw new MessageNotFoundException(id);
        }
    }

    @Transactional(readOnly = true)
    public String decrypt(UUID id, UUID ownerId) {
        Message message = find(id, ownerId);
        try {
            return cryptoService.decrypt(new EncryptedPayload(
                    message.getFormatVersion(), message.getKeyId(), message.getNonce(), message.getCiphertext(),
                    message.getTag()), ownerId);
        } catch (CryptoException exception) {
            throw new MessageUndecryptableException(exception);
        }
    }

    private Message find(UUID id, UUID ownerId) {
        return messageRepository.findByIdAndOwner_Id(id, ownerId).orElseThrow(() -> new MessageNotFoundException(id));
    }

    private MessageResponse response(Message message) {
        try {
            EncryptedPayload envelope = new EncryptedPayload(
                    message.getFormatVersion(), message.getKeyId(), message.getNonce(), message.getCiphertext(),
                    message.getTag());
            return new MessageResponse(message.getId(), message.getCreatedAt(), packageCodec.encode(envelope));
        } catch (CryptoException exception) {
            throw new MessageUndecryptableException(exception);
        }
    }
}
