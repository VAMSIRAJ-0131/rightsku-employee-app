package com.rightsku.employee_app;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Push notifications and scheduled jobs.
 *
 * Firebase is switched on by pointing FCM_CREDENTIALS_FILE at a Firebase
 * service account key (JSON, kept outside the project and Git). Without it
 * the app works as before: notifications appear in the in-app inbox and no
 * pushes are sent. A wrong or unreadable file is reported once at start-up
 * and pushes stay off; the server still starts.
 */
@Configuration
@EnableScheduling
public class PushConfig {

    private static final Logger log = LoggerFactory.getLogger(PushConfig.class);

    @Bean
    public PushSender pushSender(@Value("${app.push.fcm.credentials-file:}") String credentialsFile) {
        if (credentialsFile == null || credentialsFile.isBlank()) {
            log.info("Push notifications are off: FCM_CREDENTIALS_FILE is not set.");
            return PushSender.NONE;
        }
        Path path = Path.of(credentialsFile.trim());
        if (!Files.isReadable(path)) {
            log.warn("Push notifications are off: the FCM_CREDENTIALS_FILE path can't be read.");
            return PushSender.NONE;
        }
        try {
            PushSender sender = new FcmPushSender(path);
            log.info("Push notifications are on (Firebase Cloud Messaging).");
            return sender;
        } catch (IOException | RuntimeException e) {
            log.warn("Push notifications are off: the Firebase key could not be used ({}).", e.getClass().getSimpleName());
            return PushSender.NONE;
        }
    }
}
