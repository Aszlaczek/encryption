package com.szlaczek.backend.message.api;

import java.util.List;

/** Cursor-paginated list of the owner's messages. */
public record MessagePageResponse(List<MessageSummary> items, String nextCursor, boolean hasMore) {

    public MessagePageResponse {
        items = List.copyOf(items);
    }
}
