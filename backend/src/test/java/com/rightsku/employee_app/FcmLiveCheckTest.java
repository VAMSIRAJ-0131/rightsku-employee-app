package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * A live check against the real Firebase project. Off unless FCM_LIVE_CHECK=true;
 * it reads the key from FCM_CREDENTIALS_FILE (never printed) and, when
 * FCM_TEST_TOKEN holds a phone's push token, sends that phone one test push.
 */
@EnabledIfEnvironmentVariable(named = "FCM_LIVE_CHECK", matches = "true")
class FcmLiveCheckTest {

    @Test
    void theFirebaseKeySignsInAndATestPushReachesThePhone() throws Exception {
        FcmPushSender sender = new FcmPushSender(Path.of(System.getenv("FCM_CREDENTIALS_FILE")));
        String accessToken = sender.accessToken();
        assertThat(accessToken).as("signed in to Firebase").isNotBlank();

        String phone = System.getenv("FCM_TEST_TOKEN");
        if (phone != null && !phone.isBlank()) {
            assertThat(sender.sendOne(accessToken, phone, "RightCentral test",
                    "Push notifications are working on this phone.", Map.of("type", "TEST")))
                    .isEqualTo(FcmPushSender.Outcome.SENT);
        }
    }
}
