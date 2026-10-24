package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Reading and marking notifications: always only the signed-in account's own. Repository mocked. */
class NotificationServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-23T06:30:00Z"), ZoneId.of("Asia/Kolkata"));

    private NotificationRepository rows;
    private NotificationService service;

    @BeforeEach
    void setUp() {
        rows = mock(NotificationRepository.class);
        service = new NotificationService(rows, CLOCK);
        when(rows.save(any(Notification.class))).thenAnswer(call -> call.getArgument(0));
    }

    private static Notification stored(long id, long userId, boolean read) {
        Notification n = Notification.of(userId, Notification.LEAVE_APPROVED, "Casual leave approved", "Your leave was approved.",
                Instant.parse("2026-10-22T10:00:00Z"));
        ReflectionTestUtils.setField(n, "id", id);
        if (read) {
            n.markRead(Instant.parse("2026-10-22T11:00:00Z"));
        }
        return n;
    }

    @Test
    void listsOnlyTheAccountsOwnNotificationsWithTheUnreadCount() {
        when(rows.findTop50ByUserIdOrderByCreatedAtDescIdDesc(110L)).thenReturn(List.of(stored(2, 110, false), stored(1, 110, true)));
        when(rows.countByUserIdAndReadAtIsNull(110L)).thenReturn(1L);

        NotificationResponse.Page page = service.mine(110L);

        assertThat(page.unreadCount()).isEqualTo(1);
        assertThat(page.items()).extracting(NotificationResponse::id).containsExactly(2L, 1L);
        assertThat(page.items()).extracting(NotificationResponse::read).containsExactly(false, true);
        verify(rows).findTop50ByUserIdOrderByCreatedAtDescIdDesc(110L);
    }

    @Test
    void markingReadSetsTheTimeOnce() {
        Notification mine = stored(5, 110, false);
        when(rows.findByIdAndUserId(5L, 110L)).thenReturn(Optional.of(mine));

        assertThat(service.markRead(110L, 5L).read()).isTrue();
        assertThat(mine.getReadAt()).isEqualTo(CLOCK.instant());
        mine.markRead(Instant.parse("2027-01-01T00:00:00Z"));
        assertThat(mine.getReadAt()).as("the first read time is kept").isEqualTo(CLOCK.instant());
    }

    @Test
    void anotherAccountsNotificationIsNotFoundAndUnchanged() {
        when(rows.findByIdAndUserId(5L, 120L)).thenReturn(Optional.empty());

        Throwable thrown = catchThrowable(() -> service.markRead(120L, 5L));

        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(rows, never()).save(any());
    }

    @Test
    void markAllReadOnlyTouchesTheAccountsOwnRows() {
        when(rows.findTop50ByUserIdOrderByCreatedAtDescIdDesc(110L)).thenReturn(List.of());

        service.markAllRead(110L);

        verify(rows).markAllRead(110L, CLOCK.instant());
    }

    @Test
    void longTextIsShortenedToFitTheColumns() {
        Notification n = Notification.of(1L, Notification.DOCUMENT_PUBLISHED, "t".repeat(400), "m".repeat(900), CLOCK.instant());
        assertThat(n.getTitle()).hasSize(Notification.MAX_TITLE);
        assertThat(n.getMessage()).hasSize(Notification.MAX_MESSAGE);
    }
}
