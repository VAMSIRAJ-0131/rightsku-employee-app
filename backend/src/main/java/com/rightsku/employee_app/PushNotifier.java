package com.rightsku.employee_app;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Pushes each new in-app notification to the account's phones, straight
 * after the action that created it is saved (HR approving or rejecting, a
 * new payslip, a reminder...). Sending runs in the background, so HR never
 * waits for Firebase, and a failed push never undoes the action.
 */
@Component
public class PushNotifier {

    private static final Logger log = LoggerFactory.getLogger(PushNotifier.class);

    /** A notification was saved for this account. */
    public record Created(long userId, String type, String title, String message, String linkType, String linkKey) {
    }

    private final PushSender sender;
    private final PushTokenRepository tokens;
    private final ObjectProvider<TaskExecutor> executor;
    private final TransactionTemplate transaction;

    public PushNotifier(PushSender sender, PushTokenRepository tokens, ObjectProvider<TaskExecutor> executor,
            PlatformTransactionManager transactions) {
        this.sender = sender;
        this.tokens = tokens;
        this.executor = executor;
        this.transaction = new TransactionTemplate(transactions);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onCreated(Created event) {
        if (!sender.enabled()) {
            return;
        }
        TaskExecutor pool = executor.getIfUnique();
        if (pool == null) {
            deliver(event);
        } else {
            pool.execute(() -> deliver(event));
        }
    }

    void deliver(Created event) {
        List<String> phones = tokens.findByUserId(event.userId()).stream().map(PushToken::getToken).toList();
        if (phones.isEmpty()) {
            log.info("Push skipped: {} for account {} has no phone registered.", event.type(), event.userId());
            return;
        }
        Set<String> gone = sender.send(phones, event.title(), event.message(), Map.of(
                "type", event.type(),
                "linkType", event.linkType() == null ? "" : event.linkType(),
                "linkKey", event.linkKey() == null ? "" : event.linkKey()));
        // Account id, type and count only: never the token or the message.
        log.info("Push sent: {} to {} phone(s) of account {}.", event.type(), phones.size() - gone.size(), event.userId());
        if (!gone.isEmpty()) {
            transaction.executeWithoutResult(status -> tokens.deleteTokens(gone));
        }
    }
}
