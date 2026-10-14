package com.rightsku.employee_app;

import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Finds the account for a sign-in attempt.
 *
 * <ul>
 *   <li>Employees sign in with their Employee ID (e.g. EMP001).</li>
 *   <li>HR Admins sign in with their work email (contains "@").</li>
 * </ul>
 *
 * Email sign-in is accepted only for HR Admin accounts. Any mismatch is
 * reported exactly like an unknown user, so the response never reveals
 * which accounts or sign-in methods exist.
 *
 * <p>Why a sign-in was refused is written to the server log only (never to
 * the response), and without the typed ID, email or password, so problems
 * can be diagnosed from the backend console.
 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private static final Logger log = LoggerFactory.getLogger(AppUserDetailsService.class);

    private final AppUserRepository appUserRepository;

    public AppUserDetailsService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /**
     * Resolves the sign-in identifier (Employee ID, or email for HR Admins).
     *
     * <ul>
     *   <li>Employee IDs are normalized exactly like stored IDs
     *       ({@link AppUser#normalizeLoginId}): " emp001 " finds EMP001. A value
     *       that can never be a valid Employee ID is refused without a lookup.</li>
     *   <li>Emails are trimmed and lower-cased (stored emails are lower case).</li>
     * </ul>
     */
    public Optional<AppUser> findForLogin(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        String value = identifier.trim();

        if (value.contains("@")) {
            String email = value.toLowerCase(Locale.ROOT);
            Optional<AppUser> user = appUserRepository.findByEmailIgnoreCase(email);
            if (user.isEmpty()) {
                log.info("Sign-in refused: no account uses that email.");
                return Optional.empty();
            }
            if (!AppUser.ROLE_HR_ADMIN.equals(user.get().getRole())) {
                log.info("Sign-in refused: email sign-in is only for HR Admins; employees use their Employee ID.");
                return Optional.empty();
            }
            return user;
        }

        String loginId;
        try {
            loginId = AppUser.normalizeLoginId(value);
        } catch (IllegalArgumentException ex) {
            log.info("Sign-in refused: the value is not a valid Employee ID.");
            return Optional.empty();
        }
        Optional<AppUser> user = appUserRepository.findByLoginIdIgnoreCase(loginId);
        if (user.isEmpty()) {
            log.info("Sign-in refused: no account has that Employee ID (HR Admins sign in with their email).");
        }
        return user;
    }

    @Override
    public UserDetails loadUserByUsername(String identifier)
            throws UsernameNotFoundException {

        AppUser appUser = findForLogin(identifier)
                .orElseThrow(() ->
                        new UsernameNotFoundException("User not found"));

        // The internal user ID is used as the principal name, so the login
        // response and token always refer to exactly this account.
        return User.withUsername(String.valueOf(appUser.getId()))
                .password(appUser.getPasswordHash())
                .roles(appUser.getRole())
                .disabled(!appUser.isActive())
                .build();
    }
}
