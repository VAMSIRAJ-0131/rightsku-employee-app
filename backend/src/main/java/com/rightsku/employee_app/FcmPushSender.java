package com.rightsku.employee_app;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Firebase Cloud Messaging (HTTP v1 API). Signs in with a Firebase service
 * account key file (path in FCM_CREDENTIALS_FILE, kept outside the code and
 * Git) and sends each notification on the "updates" Android channel with high
 * priority, so it shows even when the app is closed.
 *
 * Message contents are only what the employee already sees in the app.
 * Tokens and keys are never logged.
 */
public class FcmPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(FcmPushSender.class);
    private static final String SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

    private final GoogleCredentials credentials;
    private final String projectId;
    private final RestClient http;

    public FcmPushSender(Path credentialsFile) throws IOException {
        try (InputStream in = Files.newInputStream(credentialsFile)) {
            GoogleCredentials loaded = GoogleCredentials.fromStream(in);
            if (!(loaded instanceof ServiceAccountCredentials account) || account.getProjectId() == null) {
                throw new IOException("FCM_CREDENTIALS_FILE must be a Firebase service account key (JSON) with a project_id.");
            }
            this.projectId = account.getProjectId();
            this.credentials = loaded.createScoped(List.of(SCOPE));
        }
        this.http = RestClient.create("https://fcm.googleapis.com");
    }

    @Override
    public boolean enabled() {
        return true;
    }

    /** What happened to one push. */
    enum Outcome { SENT, GONE, FAILED }

    @Override
    public Set<String> send(List<String> tokens, String title, String body, Map<String, String> data) {
        Set<String> gone = new HashSet<>();
        if (tokens.isEmpty()) {
            return gone;
        }
        String accessToken;
        try {
            accessToken = accessToken();
        } catch (IOException e) {
            log.warn("Push not sent: could not sign in to Firebase ({}).", e.getClass().getSimpleName());
            return gone;
        }
        for (String token : tokens) {
            if (sendOne(accessToken, token, title, body, data) == Outcome.GONE) {
                gone.add(token);
            }
        }
        return gone;
    }

    /** Signs in to Firebase with the service account (a short-lived access token, renewed when needed). */
    String accessToken() throws IOException {
        credentials.refreshIfExpired();
        return credentials.getAccessToken().getTokenValue();
    }

    Outcome sendOne(String accessToken, String token, String title, String body, Map<String, String> data) {
        Map<String, Object> message = Map.of("message", Map.of(
                "token", token,
                "notification", Map.of("title", title, "body", body),
                "data", data,
                "android", Map.of(
                        "priority", "HIGH",
                        "notification", Map.of("channel_id", "updates", "default_sound", true))));
        try {
            http.post()
                    .uri("/v1/projects/{project}/messages:send", projectId)
                    .header("Authorization", "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(message)
                    .retrieve()
                    .toBodilessEntity();
            return Outcome.SENT;
        } catch (RestClientResponseException e) {
            if (isGone(e.getStatusCode(), e.getResponseBodyAsString())) {
                return Outcome.GONE;
            }
            log.warn("Push not sent: Firebase answered HTTP {}.", e.getStatusCode().value());
            return Outcome.FAILED;
        } catch (RuntimeException e) {
            log.warn("Push not sent: {}.", e.getClass().getSimpleName());
            return Outcome.FAILED;
        }
    }

    /** The phone's token is no longer valid (app uninstalled or data cleared). */
    static boolean isGone(HttpStatusCode status, String body) {
        return status.value() == 404 || (body != null && body.contains("UNREGISTERED"));
    }
}
