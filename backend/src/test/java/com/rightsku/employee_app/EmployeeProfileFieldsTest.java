package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** Gender, name prefix, office address and the full name with prefix. Repositories mocked. */
class EmployeeProfileFieldsTest {

    private EmployeeRepository employees;
    private AppUserRepository users;
    private CompanyAddressRepository addresses;
    private EmployeeService service;

    @BeforeEach
    void setUp() {
        employees = mock(EmployeeRepository.class);
        users = mock(AppUserRepository.class);
        addresses = mock(CompanyAddressRepository.class);
        service = new EmployeeService(employees, users, mock(AuditEntryRepository.class), new BCryptPasswordEncoder(4), addresses);
        when(users.findByLoginIdIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(employees.saveAndFlush(any(Employee.class))).thenAnswer(call -> call.getArgument(0));
        when(users.saveAndFlush(any(AppUser.class))).thenAnswer(call -> call.getArgument(0));
        CompanyAddress office = CompanyAddress.create("Head office", "Test street 1", 1L);
        ReflectionTestUtils.setField(office, "id", 7L);
        CompanyAddress old = CompanyAddress.create("Old office", "Test street 9", 1L);
        ReflectionTestUtils.setField(old, "id", 8L);
        old.change("Old office", "Test street 9", false, 1L);
        when(addresses.findById(7L)).thenReturn(Optional.of(office));
        when(addresses.findById(8L)).thenReturn(Optional.of(old));
    }

    private static CreateEmployeeRequest create(String gender, String prefix, Long office) {
        return new CreateEmployeeRequest("EMP050", "Vamsi", "Ajjampudi", "vamsi@example.invalid", null, null, null, null,
                "Test-Only-Passw0rd!", gender, prefix, office);
    }

    private static void assertApiError(Throwable thrown, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void hrSavesGenderPrefixAndOfficeAndReadsThemBack() {
        EmployeeResponse created = service.create(create("male", "Mr.", 7L), 1L);

        assertThat(created.gender()).isEqualTo("MALE");
        assertThat(created.namePrefix()).isEqualTo("MR");
        assertThat(created.companyAddressId()).isEqualTo(7L);
        assertThat(created.displayName()).isEqualTo("Mr. Vamsi Ajjampudi");
    }

    @Test
    void theyAreOptionalSoExistingEmployeesStayValid() {
        EmployeeResponse created = service.create(new CreateEmployeeRequest("EMP051", "Asha", "Rao", "asha@example.invalid",
                null, null, null, null, "Test-Only-Passw0rd!"), 1L);

        assertThat(created.gender()).isNull();
        assertThat(created.namePrefix()).isNull();
        assertThat(created.displayName()).isEqualTo("Asha Rao");
    }

    @Test
    void onlyAllowedValuesAndActiveOfficesAreAccepted() {
        assertApiError(catchThrowable(() -> service.create(create("OTHER", null, null), 1L)), "gender");
        assertApiError(catchThrowable(() -> service.create(create(null, "Dr", null), 1L)), "namePrefix");
        assertApiError(catchThrowable(() -> service.create(create(null, null, 99L), 1L)), "companyAddressId");
        assertApiError(catchThrowable(() -> service.create(create(null, null, 8L), 1L)), "companyAddressId");
    }

    @Test
    void hrUpdatesTheFieldsAndAnOfficeNoLongerInUseCanBeKept() {
        AppUser account = AppUser.create("EMP052", "ms@example.invalid", "hash", AppUser.ROLE_EMPLOYEE);
        Employee e = Employee.create(account, "EMP052", new Employee.EmployeeDetails("Priya", "Shah", null, null, null, null));
        ReflectionTestUtils.setField(e, "id", 52L);
        e.applyProfile(null, null, 8L); // the old office, since made inactive
        when(employees.findById(52L)).thenReturn(Optional.of(e));

        EmployeeResponse updated = service.update(52L, new UpdateEmployeeRequest("Priya", "Shah", "ms@example.invalid",
                null, null, null, null, "FEMALE", "MRS", 8L), 1L);

        assertThat(updated.gender()).isEqualTo("FEMALE");
        assertThat(updated.displayName()).isEqualTo("Mrs. Priya Shah");
        assertThat(updated.companyAddressId()).isEqualTo(8L);
    }

    @Test
    void thePrefixIsNeverShownTwice() {
        assertThat(EmployeeNames.display("MR", "Mr. Vamsi", "Ajjampudi")).isEqualTo("Mr. Vamsi Ajjampudi");
        assertThat(EmployeeNames.display("MS", "ms Asha", "Rao")).isEqualTo("ms Asha Rao");
        assertThat(EmployeeNames.display("MRS", "Priya", "Shah")).isEqualTo("Mrs. Priya Shah");
        assertThat(EmployeeNames.display(null, "Vamsi", "Ajjampudi")).isEqualTo("Vamsi Ajjampudi");
        assertThat(EmployeeNames.display("MR", "Mrinal", "Sen")).as("a name starting with Mr letters").isEqualTo("Mr. Mrinal Sen");
    }
}
