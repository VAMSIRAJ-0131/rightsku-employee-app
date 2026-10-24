package com.rightsku.employee_app;

import java.time.Clock;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The company profile (name, phone, office addresses), managed by HR, and the
 * employee's virtual ID card that shows it.
 *
 * <ul>
 *   <li>Nothing is filled in by the app: until HR saves them, the name and
 *       phone are null and there are no addresses.</li>
 *   <li>Phone: optional; digits with spaces, +, -, ( and ), 7 to 15 digits.</li>
 *   <li>An address is never deleted, only made inactive, so an ID card that
 *       uses it keeps working; inactive addresses can't be chosen again.</li>
 *   <li>Every change is in the audit log.</li>
 * </ul>
 */
@Service
public class CompanyService {

    private static final Pattern PHONE_CHARS = Pattern.compile("^[0-9+()\\-\\s]+$");

    private final CompanyProfileRepository profiles;
    private final CompanyAddressRepository addresses;
    private final EmployeeRepository employees;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public CompanyService(
            CompanyProfileRepository profiles,
            CompanyAddressRepository addresses,
            EmployeeRepository employees,
            AuditEntryRepository audit,
            Clock clock) {
        this.profiles = profiles;
        this.addresses = addresses;
        this.employees = employees;
        this.audit = audit;
        this.clock = clock;
    }

    /* ---------- HR ---------- */

    @Transactional(readOnly = true)
    public CompanyProfileResponse get() {
        CompanyProfile p = profiles.findById(CompanyProfile.ID).orElse(null);
        return new CompanyProfileResponse(
                p == null ? null : p.getName(),
                p == null ? null : p.getPhone(),
                p == null ? null : p.getUpdatedAt(),
                addresses.findAllByOrderByActiveDescLabelAscIdAsc().stream().map(CompanyProfileResponse.Address::from).toList());
    }

    @Transactional
    public CompanyProfileResponse save(CompanyProfileRequest request, Long actorUserId) {
        String name = clean(request.name());
        if (name == null) {
            throw ApiException.invalid("name", "Company name is required.");
        }
        String phone = checkPhone(request.phone());
        CompanyProfile p = profiles.findById(CompanyProfile.ID).orElseGet(CompanyProfile::create);
        p.change(name, phone, actorUserId, clock.instant());
        profiles.saveAndFlush(p);
        audit.save(AuditEntry.of(actorUserId, "COMPANY_PROFILE_CHANGED", "COMPANY", "1"));
        return get();
    }

    @Transactional
    public CompanyProfileResponse addAddress(CompanyAddressRequest request, Long actorUserId) {
        CompanyAddress a = CompanyAddress.create(required(request.label(), "label"), required(request.address(), "address"),
                actorUserId);
        addresses.saveAndFlush(a);
        audit.save(AuditEntry.of(actorUserId, "COMPANY_ADDRESS_ADDED", "COMPANY_ADDRESS", String.valueOf(a.getId())));
        return get();
    }

    @Transactional
    public CompanyProfileResponse changeAddress(long id, CompanyAddressRequest request, Long actorUserId) {
        CompanyAddress a = addresses.findById(id).orElseThrow(() -> ApiException.notFound("Address not found."));
        boolean active = request.active() == null ? a.isActive() : request.active();
        a.change(required(request.label(), "label"), required(request.address(), "address"), active, actorUserId);
        addresses.saveAndFlush(a);
        audit.save(AuditEntry.of(actorUserId, "COMPANY_ADDRESS_CHANGED", "COMPANY_ADDRESS", String.valueOf(id)));
        return get();
    }

    /* ---------- Employee: their own ID card ---------- */

    @Transactional(readOnly = true)
    public EmployeeIdCardResponse idCard(long userId) {
        Employee e = employees.findByUser_Id(userId)
                .orElseThrow(() -> ApiException.notFound("No employee record is linked to this account."));
        CompanyProfile p = profiles.findById(CompanyProfile.ID).orElse(null);
        CompanyAddress office = e.getCompanyAddressId() == null ? null : addresses.findById(e.getCompanyAddressId()).orElse(null);
        return new EmployeeIdCardResponse(e.displayName(), e.getEmployeeCode(), e.getDepartment(), e.getJobTitle(),
                p == null ? null : p.getName(), p == null ? null : p.getPhone(),
                office == null ? null : office.getLabel(), office == null ? null : office.getAddress());
    }

    /* ---------- Checks ---------- */

    static String checkPhone(String value) {
        String phone = clean(value);
        if (phone == null) {
            return null;
        }
        long digits = phone.chars().filter(Character::isDigit).count();
        if (!PHONE_CHARS.matcher(phone).matches() || digits < 7 || digits > 15) {
            throw ApiException.invalid("phone", "Enter a valid phone number (7 to 15 digits; spaces, +, - and brackets allowed).");
        }
        return phone;
    }

    private static String required(String value, String field) {
        String v = clean(value);
        if (v == null) {
            throw ApiException.invalid(field, field.equals("label") ? "Give the office a name." : "Address is required.");
        }
        return v;
    }

    private static String clean(String value) {
        if (value == null) {
            return null;
        }
        String v = value.replaceAll("[\\p{Cntrl}&&[^\\n]]", " ").strip();
        return v.isEmpty() ? null : v;
    }
}
