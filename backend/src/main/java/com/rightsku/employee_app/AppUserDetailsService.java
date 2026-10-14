package com.rightsku.employee_app;

import java.util.Optional;

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
 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public AppUserDetailsService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /** Resolves the sign-in identifier (Employee ID, or email for HR Admins). */
    public Optional<AppUser> findForLogin(String identifier) {
        if (identifier == null) {
            return Optional.empty();
        }
        String value = identifier.trim();
        if (value.isEmpty()) {
            return Optional.empty();
        }
        if (value.contains("@")) {
            return appUserRepository.findByEmailIgnoreCase(value)
                    .filter(user -> AppUser.ROLE_HR_ADMIN.equals(user.getRole()));
        }
        return appUserRepository.findByLoginIdIgnoreCase(value);
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
