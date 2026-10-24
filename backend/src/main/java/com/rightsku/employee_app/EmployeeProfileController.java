package com.rightsku.employee_app;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's own profile (name, department, job title, ...),
 * read only. /api/employee/** requires the EMPLOYEE role; the employee is
 * always taken from the token, so nobody can read another employee's profile
 * here. Changes (details and photo) are made only by HR through
 * /api/hr/employees.
 */
@RestController
@RequestMapping("/api/employee/profile")
public class EmployeeProfileController {

    private final EmployeeService employeeService;
    private final EmployeePhotoService photos;
    private final CompanyService company;

    public EmployeeProfileController(EmployeeService employeeService, EmployeePhotoService photos, CompanyService company) {
        this.employeeService = employeeService;
        this.photos = photos;
        this.company = company;
    }

    /** The employee's own virtual ID card: their details, the company name and their office address. */
    @GetMapping("/id-card")
    public EmployeeIdCardResponse idCard(@AuthenticationPrincipal Jwt jwt) {
        return company.idCard(Long.parseLong(jwt.getSubject()));
    }

    @GetMapping
    public EmployeeResponse mine(@AuthenticationPrincipal Jwt jwt) {
        return employeeService.mine(Long.parseLong(jwt.getSubject()));
    }

    /** The employee's own photo (404 if HR has not added one). There is no way to change it here. */
    @GetMapping("/photo")
    public ResponseEntity<byte[]> myPhoto(@AuthenticationPrincipal Jwt jwt) {
        return HrEmployeePhotoController.image(photos.mine(Long.parseLong(jwt.getSubject())));
    }
}
