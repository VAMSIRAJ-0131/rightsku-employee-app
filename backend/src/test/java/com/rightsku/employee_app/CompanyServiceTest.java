package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Company profile, office addresses and the employee ID card. Repositories mocked; no company data is made up. */
class CompanyServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-24T06:00:00Z"), ZoneId.of("Asia/Kolkata"));
    private static final Long HR = 1L;

    private CompanyProfileRepository profiles;
    private CompanyAddressRepository addresses;
    private EmployeeRepository employees;
    private AuditEntryRepository audit;
    private CompanyService service;
    private final List<CompanyAddress> rows = new ArrayList<>();
    private CompanyProfile stored;

    @BeforeEach
    void setUp() {
        profiles = mock(CompanyProfileRepository.class);
        addresses = mock(CompanyAddressRepository.class);
        employees = mock(EmployeeRepository.class);
        audit = mock(AuditEntryRepository.class);
        service = new CompanyService(profiles, addresses, employees, audit, CLOCK);
        when(profiles.findById(CompanyProfile.ID)).thenAnswer(call -> Optional.ofNullable(stored));
        when(profiles.saveAndFlush(any(CompanyProfile.class))).thenAnswer(call -> stored = call.getArgument(0));
        when(addresses.findAllByOrderByActiveDescLabelAscIdAsc()).thenAnswer(call -> List.copyOf(rows));
        when(addresses.findById(any())).thenAnswer(call ->
                rows.stream().filter(a -> a.getId().equals(call.getArgument(0))).findFirst());
        when(addresses.saveAndFlush(any(CompanyAddress.class))).thenAnswer(call -> {
            CompanyAddress a = call.getArgument(0);
            if (!rows.contains(a)) {
                ReflectionTestUtils.setField(a, "id", 100L + rows.size());
                rows.add(a);
            }
            return a;
        });
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void nothingIsFilledInUntilHrSavesIt() {
        CompanyProfileResponse empty = service.get();

        assertThat(empty.name()).isNull();
        assertThat(empty.phone()).isNull();
        assertThat(empty.addresses()).isEmpty();
    }

    @Test
    void hrSavesNameAndPhoneWithAnAuditEntry() {
        CompanyProfileResponse saved = service.save(new CompanyProfileRequest("  Test Company Pvt Ltd ", "+91 40 1234 5678"), HR);

        assertThat(saved.name()).isEqualTo("Test Company Pvt Ltd");
        assertThat(saved.phone()).isEqualTo("+91 40 1234 5678");
        verify(audit).save(any(AuditEntry.class));
        // Read back.
        assertThat(service.get().name()).isEqualTo("Test Company Pvt Ltd");
    }

    @Test
    void phoneAndNameAreChecked() {
        for (String bad : new String[] {"12345", "abc-defg-hij", "+91 1234 5678 9012 3456", "12@34567890"}) {
            assertApiError(catchThrowable(() -> service.save(new CompanyProfileRequest("Test Co", bad), HR)),
                    HttpStatus.BAD_REQUEST, "phone");
        }
        assertApiError(catchThrowable(() -> service.save(new CompanyProfileRequest("   ", null), HR)),
                HttpStatus.BAD_REQUEST, "name");
        assertThat(service.save(new CompanyProfileRequest("Test Co", "  "), HR).phone()).as("phone is optional").isNull();
    }

    @Test
    void addressesAreAddedChangedAndRetiredButNeverDeleted() {
        service.addAddress(new CompanyAddressRequest("Head office", "Test street 1, Test city", null), HR);
        CompanyProfileResponse after = service.changeAddress(100L,
                new CompanyAddressRequest("Head office", "Test street 2, Test city", false), HR);

        assertThat(after.addresses()).hasSize(1);
        assertThat(after.addresses().get(0).address()).isEqualTo("Test street 2, Test city");
        assertThat(after.addresses().get(0).active()).isFalse();
        assertApiError(catchThrowable(() -> service.addAddress(new CompanyAddressRequest(" ", "x", null), HR)),
                HttpStatus.BAD_REQUEST, "label");
        assertApiError(catchThrowable(() -> service.changeAddress(999L, new CompanyAddressRequest("a", "b", null), HR)),
                HttpStatus.NOT_FOUND, null);
    }

    private Employee employee(String prefix, Long addressId) {
        AppUser account = AppUser.create("EMP010", "ravi@example.invalid", "hash", AppUser.ROLE_EMPLOYEE);
        Employee e = Employee.create(account, "EMP010", new Employee.EmployeeDetails("Vamsi", "Ajjampudi", null, "IT", "Developer", null));
        e.applyProfile("MALE", prefix, addressId);
        when(employees.findByUser_Id(110L)).thenReturn(Optional.of(e));
        return e;
    }

    @Test
    void theIdCardShowsTheEmployeesOwnDetailsAndTheirChosenOffice() {
        service.save(new CompanyProfileRequest("Test Company", "+91 40 1234 5678"), HR);
        service.addAddress(new CompanyAddressRequest("Head office", "Test street 1, Test city", null), HR);
        employee("MR", 100L);

        EmployeeIdCardResponse card = service.idCard(110L);

        assertThat(card.displayName()).isEqualTo("Mr. Vamsi Ajjampudi");
        assertThat(card.employeeCode()).isEqualTo("EMP010");
        assertThat(card.companyName()).isEqualTo("Test Company");
        assertThat(card.officeLabel()).isEqualTo("Head office");
        assertThat(card.officeAddress()).isEqualTo("Test street 1, Test city");
    }

    @Test
    void anIdCardWithNothingSetYetShowsNoInventedValues() {
        employee(null, null);

        EmployeeIdCardResponse card = service.idCard(110L);

        assertThat(card.displayName()).isEqualTo("Vamsi Ajjampudi");
        assertThat(card.companyName()).isNull();
        assertThat(card.companyPhone()).isNull();
        assertThat(card.officeAddress()).isNull();
        verify(audit, never()).save(any());
    }

    @Test
    void anAccountWithoutAnEmployeeRecordGets404() {
        when(employees.findByUser_Id(5L)).thenReturn(Optional.empty());
        assertApiError(catchThrowable(() -> service.idCard(5L)), HttpStatus.NOT_FOUND, null);
    }
}
