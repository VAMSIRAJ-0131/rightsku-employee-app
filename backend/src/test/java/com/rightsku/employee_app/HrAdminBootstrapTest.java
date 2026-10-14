package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Unit tests with a mocked repository: no database is touched and no
 * real account is created.
 */
class HrAdminBootstrapTest {

    // Test-only value.
    private static final String TEST_PASSWORD = "Test-Only-Passw0rd!";

    private AppUserRepository repository;
    private PasswordEncoder passwordEncoder;
    private MockEnvironment environment;

    @BeforeEach
    void setUp() {
        repository = mock(AppUserRepository.class);
        passwordEncoder = new BCryptPasswordEncoder(4); // low cost keeps tests fast
        environment = new MockEnvironment()
                .withProperty(HrAdminBootstrap.EMAIL_PROPERTY, "hr@rightsku.com");
    }

    private void run() {
        new HrAdminBootstrap(environment, repository, passwordEncoder)
                .run(new DefaultApplicationArguments());
    }

    private void enable(String password) {
        environment.setProperty(HrAdminBootstrap.ENABLED_VARIABLE, "true");
        if (password != null) {
            environment.setProperty(HrAdminBootstrap.PASSWORD_VARIABLE, password);
        }
    }

    @Test
    void doesNothingByDefault() {
        environment.setProperty(HrAdminBootstrap.PASSWORD_VARIABLE, TEST_PASSWORD);

        run();

        verify(repository, never()).save(any());
    }

    @Test
    void createsHrAdminWithHashedPasswordWhenEnabled() {
        enable(TEST_PASSWORD);

        run();

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(repository).save(saved.capture());
        AppUser user = saved.getValue();
        assertThat(user.getEmail()).isEqualTo("hr@rightsku.com");
        assertThat(user.getRole()).isEqualTo(AppUser.ROLE_HR_ADMIN);
        assertThat(user.getLoginId()).as("HR Admin signs in by email, no Employee ID").isNull();
        assertThat(user.isActive()).isTrue();
        assertThat(user.getPasswordHash()).startsWith("$2").isNotEqualTo(TEST_PASSWORD);
        assertThat(passwordEncoder.matches(TEST_PASSWORD, user.getPasswordHash())).isTrue();
    }

    @Test
    void neverOverwritesExistingAccount() {
        enable(TEST_PASSWORD);
        when(repository.existsByEmailIgnoreCase("hr@rightsku.com")).thenReturn(true);

        run();

        verify(repository, never()).save(any());
    }

    @Test
    void skipsWhenAnHrAdminAlreadyExists() {
        enable(TEST_PASSWORD);
        when(repository.existsByRole(AppUser.ROLE_HR_ADMIN)).thenReturn(true);

        run();

        verify(repository, never()).save(any());
    }

    @Test
    void failsClearlyWhenEnabledWithoutPassword() {
        enable(null);

        assertThatThrownBy(this::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(HrAdminBootstrap.PASSWORD_VARIABLE);
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsWeakPasswordWithoutRevealingIt() {
        enable("short1!");

        assertThatThrownBy(this::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("short1!");
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsPasswordLongerThanBcryptLimit() {
        enable("x".repeat(73));

        assertThatThrownBy(this::run).isInstanceOf(IllegalStateException.class);
        verify(repository, never()).save(any());
    }
}
