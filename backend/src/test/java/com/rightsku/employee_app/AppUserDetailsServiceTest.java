package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for how a sign-in identifier is resolved. No database is used. */
class AppUserDetailsServiceTest {

    private AppUserRepository repository;
    private AppUserDetailsService service;

    @BeforeEach
    void setUp() {
        repository = mock(AppUserRepository.class);
        service = new AppUserDetailsService(repository);
    }

    private static AppUser user(long id, String loginId, String email, String role, boolean active) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "active", active);
        return user;
    }

    @Test
    void employeeIdIsLookedUpByLoginId() {
        AppUser employee = user(2L, "EMP001", "emp@rightsku.com", AppUser.ROLE_EMPLOYEE, true);
        when(repository.findByLoginIdIgnoreCase("EMP001")).thenReturn(Optional.of(employee));

        UserDetails details = service.loadUserByUsername("  EMP001 ");

        assertThat(details.getUsername()).isEqualTo("2");
        assertThat(details.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_EMPLOYEE");
        assertThat(details.isEnabled()).isTrue();
        verify(repository, never()).findByEmailIgnoreCase(anyString());
    }

    @Test
    void emailIsLookedUpForHrAdmin() {
        AppUser hr = user(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN, true);
        when(repository.findByEmailIgnoreCase("hr@rightsku.com")).thenReturn(Optional.of(hr));

        UserDetails details = service.loadUserByUsername("hr@rightsku.com");

        assertThat(details.getUsername()).isEqualTo("1");
        assertThat(details.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_HR_ADMIN");
        verify(repository, never()).findByLoginIdIgnoreCase(anyString());
    }

    @Test
    void employeeEmailIsNotAcceptedForSignIn() {
        AppUser employee = user(2L, "EMP001", "emp@rightsku.com", AppUser.ROLE_EMPLOYEE, true);
        when(repository.findByEmailIgnoreCase("emp@rightsku.com")).thenReturn(Optional.of(employee));

        assertThatThrownBy(() -> service.loadUserByUsername("emp@rightsku.com"))
                .isInstanceOf(UsernameNotFoundException.class);
    }

    @Test
    void unknownIdentifierIsRejected() {
        assertThatThrownBy(() -> service.loadUserByUsername("EMP404"))
                .isInstanceOf(UsernameNotFoundException.class);
        assertThatThrownBy(() -> service.loadUserByUsername("   "))
                .isInstanceOf(UsernameNotFoundException.class);
    }

    @Test
    void inactiveUserIsMarkedDisabled() {
        AppUser employee = user(2L, "EMP001", "emp@rightsku.com", AppUser.ROLE_EMPLOYEE, false);
        when(repository.findByLoginIdIgnoreCase("EMP001")).thenReturn(Optional.of(employee));

        assertThat(service.loadUserByUsername("EMP001").isEnabled()).isFalse();
    }

    @Test
    void employeeIdIsStoredTrimmedAndUpperCase() {
        AppUser employee = AppUser.create("  emp001 ", "emp@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        assertThat(employee.getLoginId()).isEqualTo("EMP001");
    }

    @Test
    void employeeIdWithInvalidCharactersIsRejected() {
        for (String bad : new String[] {"EMP 001", "emp@rightsku.com", "-EMP1", "E".repeat(31), "EMP#1"}) {
            assertThatThrownBy(() -> AppUser.create(bad, "x@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE))
                    .as(bad)
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void employeeAccountRequiresEmployeeId() {
        assertThatThrownBy(() -> AppUser.create(null, "emp@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AppUser.create("  ", "emp@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
