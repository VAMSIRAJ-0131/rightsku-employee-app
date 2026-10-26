package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Push notifications and the weekly timesheet reminder: the phone token API
 * (only the signed-in account's own token), pushes sent after a notification
 * is saved (dead tokens removed), and the Monday reminder going only to
 * employees whose last week is not submitted.
 */
class PushAndReminderTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-26T05:30:00Z"), INDIA); // Monday 11:00 IST

    /* ---------- The phone token API ---------- */

    @Nested
    @WebMvcTest(controllers = PushTokenController.class, properties = {
            "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
            "HR_ADMIN_BOOTSTRAP_ENABLED=false"
    })
    @Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, TimeConfig.class})
    class TokenApi {

        @Autowired
        private MockMvc mockMvc;

        @Autowired
        private JwtService jwtService;

        @Autowired
        private PasswordEncoder encoder;

        @MockitoBean
        private AppUserRepository users;

        @MockitoBean
        private PushTokenRepository tokens;

        @MockitoBean
        private AuditEntryRepository audit;

        private String tokenFor(long id, boolean temporaryPassword) {
            AppUser user = AppUser.create("EMP00" + id, "e" + id + "@rightsku.com", encoder.encode("Test-Only-Passw0rd!"), AppUser.ROLE_EMPLOYEE);
            ReflectionTestUtils.setField(user, "id", id);
            if (temporaryPassword) {
                user.requirePasswordChange();
            }
            when(users.findById(id)).thenReturn(Optional.of(user));
            return jwtService.generateToken(user);
        }

        private static String body(String token) {
            return "{\"token\":\"" + token + "\"}";
        }

        @Test
        void aSignedInEmployeeRegistersThisPhoneForTheirOwnAccount() throws Exception {
            String jwt = tokenFor(2L, false);
            when(tokens.findByToken("phone-token-1")).thenReturn(Optional.empty());

            mockMvc.perform(put("/api/push/token").header("Authorization", "Bearer " + jwt)
                            .contentType(MediaType.APPLICATION_JSON).content(body("phone-token-1")))
                    .andExpect(status().isNoContent());

            ArgumentCaptor<PushToken> saved = ArgumentCaptor.forClass(PushToken.class);
            verify(tokens).save(saved.capture());
            assertThat(saved.getValue().getUserId()).isEqualTo(2L);
            assertThat(saved.getValue().getToken()).isEqualTo("phone-token-1");
        }

        @Test
        void aPhoneUsedByAnotherAccountMovesToTheOneSignedInNow() throws Exception {
            String jwt = tokenFor(3L, false);
            PushToken existing = PushToken.register(2L, "shared-phone", "android", CLOCK.instant());
            when(tokens.findByToken("shared-phone")).thenReturn(Optional.of(existing));

            mockMvc.perform(put("/api/push/token").header("Authorization", "Bearer " + jwt)
                            .contentType(MediaType.APPLICATION_JSON).content(body("shared-phone")))
                    .andExpect(status().isNoContent());

            assertThat(existing.getUserId()).isEqualTo(3L);
            verify(tokens, never()).save(any());
        }

        @Test
        void logOutRemovesOnlyTheSignedInAccountsOwnToken() throws Exception {
            String jwt = tokenFor(2L, false);
            mockMvc.perform(delete("/api/push/token").header("Authorization", "Bearer " + jwt)
                            .contentType(MediaType.APPLICATION_JSON).content(body("phone-token-1")))
                    .andExpect(status().isNoContent());
            verify(tokens).deleteOwn("phone-token-1", 2L);
        }

        @Test
        void noSignInOrATemporaryPasswordCantRegisterAPhone() throws Exception {
            mockMvc.perform(put("/api/push/token").contentType(MediaType.APPLICATION_JSON).content(body("x")))
                    .andExpect(status().isUnauthorized());
            String temporary = tokenFor(4L, true);
            mockMvc.perform(put("/api/push/token").header("Authorization", "Bearer " + temporary)
                            .contentType(MediaType.APPLICATION_JSON).content(body("x")))
                    .andExpect(status().isForbidden());
            verify(tokens, never()).save(any());
        }
    }

    /* ---------- Pushes after a notification is saved ---------- */

    /** Records what would be pushed; says one token no longer exists. */
    static class FakeSender implements PushSender {
        final List<List<String>> sentTo = new ArrayList<>();
        final List<String> titles = new ArrayList<>();
        final List<Map<String, String>> data = new ArrayList<>();
        boolean on = true;

        @Override
        public boolean enabled() {
            return on;
        }

        @Override
        public Set<String> send(List<String> tokens, String title, String body, Map<String, String> payload) {
            sentTo.add(tokens);
            titles.add(title);
            data.add(payload);
            return tokens.contains("dead-token") ? Set.of("dead-token") : Set.of();
        }
    }

    @SuppressWarnings("unchecked")
    private static PushNotifier notifier(FakeSender sender, PushTokenRepository tokens) {
        ObjectProvider<TaskExecutor> noPool = mock(ObjectProvider.class); // send at once, in the test thread
        return new PushNotifier(sender, tokens, noPool, mock(PlatformTransactionManager.class));
    }

    @Test
    void aSavedNotificationIsPushedToEveryPhoneOfThatAccountAndDeadTokensAreRemoved() {
        PushTokenRepository tokens = mock(PushTokenRepository.class);
        when(tokens.findByUserId(7L)).thenReturn(List.of(
                PushToken.register(7L, "live-token", "android", CLOCK.instant()),
                PushToken.register(7L, "dead-token", "android", CLOCK.instant())));
        FakeSender sender = new FakeSender();

        notifier(sender, tokens).onCreated(new PushNotifier.Created(7L, "LEAVE_APPROVED", "Casual leave approved",
                "Your Casual leave for 2 Nov 2026 was approved.", "LEAVE_REQUEST", "41"));

        assertThat(sender.sentTo).containsExactly(List.of("live-token", "dead-token"));
        assertThat(sender.titles).containsExactly("Casual leave approved");
        assertThat(sender.data.get(0)).containsEntry("type", "LEAVE_APPROVED").containsEntry("linkKey", "41");
        verify(tokens).deleteTokens(Set.of("dead-token"));
    }

    @Test
    void withoutFirebaseOrWithoutAPhoneNothingIsSent() {
        PushTokenRepository tokens = mock(PushTokenRepository.class);
        FakeSender sender = new FakeSender();
        sender.on = false;
        notifier(sender, tokens).onCreated(new PushNotifier.Created(7L, "X", "t", "m", null, null));
        verify(tokens, never()).findByUserId(anyLong());

        sender.on = true;
        when(tokens.findByUserId(8L)).thenReturn(List.of());
        notifier(sender, tokens).onCreated(new PushNotifier.Created(8L, "X", "t", "m", null, null));
        assertThat(sender.sentTo).isEmpty();
    }

    @Test
    void everyNotificationHrCausesIsAlsoPublishedForPushing() {
        NotificationRepository rows = mock(NotificationRepository.class);
        List<Object> published = new ArrayList<>();
        NotificationService service = new NotificationService(rows, CLOCK, published::add);
        Employee ravi = employee(11L, 110L, true);

        service.timesheetReviewed(ravi, LocalDate.parse("2026-10-19"), false, "Check Friday");

        assertThat(published).singleElement().isInstanceOfSatisfying(PushNotifier.Created.class, e -> {
            assertThat(e.userId()).isEqualTo(110L);
            assertThat(e.type()).isEqualTo(Notification.TIMESHEET_REJECTED);
            assertThat(e.message()).contains("19 Oct 2026").contains("Check Friday");
            assertThat(e.linkKey()).isEqualTo("2026-10-19");
        });
    }

    @Test
    void firebaseSaysWhichTokensNoLongerExist() {
        assertThat(FcmPushSender.isGone(HttpStatusCode.valueOf(404), "")).isTrue();
        assertThat(FcmPushSender.isGone(HttpStatusCode.valueOf(400), "{\"errorCode\":\"UNREGISTERED\"}")).isTrue();
        assertThat(FcmPushSender.isGone(HttpStatusCode.valueOf(500), "server busy")).isFalse();
        assertThat(PushSender.NONE.enabled()).isFalse();
    }

    /* ---------- Monday reminder ---------- */

    private static Employee employee(long id, long userId, boolean active) {
        AppUser user = AppUser.create("EMP0" + id, "e" + id + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(user, "id", userId);
        Employee e = mock(Employee.class);
        when(e.getId()).thenReturn(id);
        when(e.getUser()).thenReturn(user);
        when(e.isActive()).thenReturn(active);
        return e;
    }

    private static WeekTimesheetResponse week(String status, LocalDate opensOn) {
        WeekTimesheetResponse w = mock(WeekTimesheetResponse.class);
        when(w.status()).thenReturn(status);
        when(w.submitOpensOn()).thenReturn(opensOn);
        return w;
    }

    @Test
    void mondayRemindsOnlyEmployeesWhoseLastWeekIsNotSubmitted() {
        EmployeeRepository employees = mock(EmployeeRepository.class);
        TimesheetService timesheets = mock(TimesheetService.class);
        NotificationRepository rows = mock(NotificationRepository.class);
        List<Object> pushed = new ArrayList<>();
        NotificationService notifications = new NotificationService(rows, CLOCK, pushed::add);

        Employee draft = employee(1L, 101L, true);
        Employee submitted = employee(2L, 102L, true);
        Employee inactive = employee(3L, 103L, false);
        Employee noWorkingDays = employee(4L, 104L, true);
        Employee joinedLater = employee(5L, 105L, true);
        when(employees.findAll()).thenReturn(List.of(draft, submitted, inactive, noWorkingDays, joinedLater));

        LocalDate lastWeek = LocalDate.parse("2026-10-19");
        WeekTimesheetResponse draftWeek = week("DRAFT", LocalDate.parse("2026-10-23"));
        WeekTimesheetResponse submittedWeek = week("SUBMITTED", LocalDate.parse("2026-10-23"));
        WeekTimesheetResponse emptyWeek = week("NOT_STARTED", null);
        when(timesheets.weekMine(101L, lastWeek)).thenReturn(draftWeek);
        when(timesheets.weekMine(102L, lastWeek)).thenReturn(submittedWeek);
        when(timesheets.weekMine(104L, lastWeek)).thenReturn(emptyWeek);
        when(timesheets.weekMine(eq(105L), any())).thenThrow(ApiException.invalid("weekStart", "That week is before your joining date."));

        int sent = new TimesheetReminderJob(employees, timesheets, notifications, CLOCK).remindFor(LocalDate.now(CLOCK));

        assertThat(sent).isEqualTo(1);
        verify(timesheets, never()).weekMine(eq(103L), any());
        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(rows).save(saved.capture());
        assertThat(saved.getValue().getType()).isEqualTo(Notification.TIMESHEET_REMINDER);
        assertThat(pushed).singleElement().isInstanceOfSatisfying(PushNotifier.Created.class, e -> {
            assertThat(e.userId()).isEqualTo(101L);
            assertThat(e.title()).isEqualTo("Submit your timesheet");
            assertThat(e.message()).contains("19 Oct 2026");
            assertThat(e.linkType()).isEqualTo("TIMESHEET_WEEK");
        });
    }
}
