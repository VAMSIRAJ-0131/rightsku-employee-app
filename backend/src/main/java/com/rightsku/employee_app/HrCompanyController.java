package com.rightsku.employee_app;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR: the company profile (name, phone) and office addresses. /api/hr/**
 * requires the HR_ADMIN role (see SecurityConfig); the person making a change
 * is taken from the token.
 */
@RestController
@RequestMapping("/api/hr/company")
public class HrCompanyController {

    private final CompanyService company;

    public HrCompanyController(CompanyService company) {
        this.company = company;
    }

    @GetMapping
    public CompanyProfileResponse get() {
        return company.get();
    }

    @PutMapping
    public CompanyProfileResponse save(@Valid @RequestBody CompanyProfileRequest request, @AuthenticationPrincipal Jwt jwt) {
        return company.save(request, actorId(jwt));
    }

    @PostMapping("/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    public CompanyProfileResponse addAddress(@Valid @RequestBody CompanyAddressRequest request, @AuthenticationPrincipal Jwt jwt) {
        return company.addAddress(request, actorId(jwt));
    }

    @PutMapping("/addresses/{id}")
    public CompanyProfileResponse changeAddress(
            @PathVariable long id, @Valid @RequestBody CompanyAddressRequest request, @AuthenticationPrincipal Jwt jwt) {
        return company.changeAddress(id, request, actorId(jwt));
    }

    private static Long actorId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
