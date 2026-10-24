package com.rightsku.employee_app;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Emails password reset codes. It works only when the server has both an SMTP
 * server (spring.mail.host and related settings, normally from environment
 * variables) and a sender address (PASSWORD_RESET_MAIL_FROM). Without them
 * {@link #available()} is false and the app says that reset by email is not
 * set up, instead of pretending to send anything.
 *
 * The code itself is never logged.
 */
@Component
public class PasswordResetMailer {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetMailer.class);

    private final ObjectProvider<JavaMailSender> sender;
    private final String from;

    public PasswordResetMailer(
            ObjectProvider<JavaMailSender> sender,
            @Value("${app.password-reset.mail-from:}") String from) {
        this.sender = sender;
        this.from = from == null ? "" : from.trim();
    }

    /** True when an SMTP server and a sender address are configured. */
    public boolean available() {
        return !from.isEmpty() && sender.getIfAvailable() != null;
    }

    public void send(String to, String code, Duration validFor) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null || from.isEmpty()) {
            log.warn("Password reset email not sent: email is not configured on the server.");
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject("Your RightCentral password reset code");
        message.setText("""
                Your RightCentral password reset code is: %s

                It works once and expires in %d minutes. Enter it in the app with your new password.

                If you did not ask to reset your password, ignore this email. Your password stays the same.

                RIGHTSKU Solutions Private Limited
                """.formatted(code, validFor.toMinutes()));
        try {
            mail.send(message);
            log.info("Password reset email sent.");
        } catch (MailException ex) {
            // The reason only (for example a refused login to the mail server); never the code or address.
            log.warn("Password reset email could not be sent: {}", ex.getClass().getSimpleName());
        }
    }
}
