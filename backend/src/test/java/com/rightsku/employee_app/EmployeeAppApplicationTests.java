package com.rightsku.employee_app;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// The HR Admin bootstrap is forced off here, so running the tests can never
// create a real account, even if HR_ADMIN_BOOTSTRAP_ENABLED is set in the shell.
@SpringBootTest(properties = "HR_ADMIN_BOOTSTRAP_ENABLED=false")
class EmployeeAppApplicationTests {

	@Test
	void contextLoads() {
	}

}
