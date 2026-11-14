package com.szlaczek.backend.message.api;

import com.szlaczek.backend.auth.AppUserPrincipal;
import com.szlaczek.backend.message.MessageService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Create, list, inspect and decrypt saved owner messages. */
@Validated
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MessageResponse> create(
            @Valid @RequestBody CreateMessageRequest body, @AuthenticationPrincipal AppUserPrincipal principal) {
        MessageResponse response = messageService.create(body, principal.getId());
        return ResponseEntity.created(URI.create("/api/messages/" + response.id())).body(response);
    }

    @GetMapping
    public MessagePageResponse list(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String cursor,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        if (limit < 1 || limit > MessageService.MAX_PAGE_SIZE) {
            throw new InvalidPageSizeException();
        }
        return messageService.list(principal.getId(), limit, cursor);
    }

    @GetMapping("/{id}")
    public MessageResponse get(@PathVariable String id, @AuthenticationPrincipal AppUserPrincipal principal) {
        return messageService.get(parseId(id), principal.getId());
    }

    @PostMapping("/{id}/decrypt")
    public PlaintextMessageResponse decrypt(
            @PathVariable String id, @AuthenticationPrincipal AppUserPrincipal principal) {
        return new PlaintextMessageResponse(messageService.decrypt(parseId(id), principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable String id, @AuthenticationPrincipal AppUserPrincipal principal) {
        messageService.delete(parseId(id), principal.getId());
        return ResponseEntity.noContent().build();
    }

    private static UUID parseId(String value) {
        try {
            if (value == null || !value.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")) {
                throw new IllegalArgumentException();
            }
            return UUID.fromString(value.toLowerCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new InvalidMessageIdException();
        }
    }
}
