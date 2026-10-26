package com.rightsku.employee_app;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Personal details changes: the employee asks (phone, address, emergency
 * contact, bank details), HR approves (the new values are saved, once) or
 * rejects, and the employee may cancel while it waits.
 *
 * <ul>
 *   <li>Only the fields in {@link ProfileField} can be changed this way;
 *       anything else is refused. Values are checked when asked for and
 *       again when approved.</li>
 *   <li>One waiting request per employee (also a unique index, V19).</li>
 *   <li>The audit log records which fields changed, never their values, so
 *       bank details don't end up in logs.</li>
 * </ul>
 */
@Service
public class ProfileChangeService {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<LinkedHashMap<String, String>> MAP = new TypeReference<>() { };

    private final ProfileChangeRequestRepository requests;
    private final EmployeeRepository employees;
    private final NotificationService notifications;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public ProfileChangeService(
            ProfileChangeRequestRepository requests,
            EmployeeRepository employees,
            NotificationService notifications,
            AuditEntryRepository audit,
            Clock clock) {
        this.requests = requests;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
        this.clock = clock;
    }

    /* ---------- Employee ---------- */

    @Transactional(readOnly = true)
    public PersonalDetailsResponse myDetails(long userId) {
        Employee me = currentEmployee(userId);
        return PersonalDetailsResponse.of(me, true, pendingId(me.getId()));
    }

    @Transactional(readOnly = true)
    public List<ProfileChangeResponse> mine(long userId) {
        Employee me = currentEmployee(userId);
        return requests.findTop20ByEmployeeIdOrderByCreatedAtDescIdDesc(me.getId()).stream()
                .map(r -> response(r, me, true)).toList();
    }

    /** The employee asks HR to change some details. Unchanged fields are left out. */
    @Transactional
    public ProfileChangeResponse ask(long userId, Map<String, String> asked) {
        Employee me = currentEmployee(userId);
        if (asked == null || asked.isEmpty()) {
            throw ApiException.invalid(null, "Change at least one detail.");
        }
        Map<String, String> changes = new LinkedHashMap<>();
        Map<String, String> previous = new LinkedHashMap<>();
        for (ProfileField field : ProfileField.values()) {
            if (!asked.containsKey(field.key())) {
                continue;
            }
            String value = field.clean(asked.get(field.key()));
            String now = field.currentValue(me);
            if (value == null ? now == null : value.equals(now)) {
                continue;
            }
            changes.put(field.key(), value);
            previous.put(field.key(), now);
        }
        for (String key : asked.keySet()) {
            if (ProfileField.byKey(key).isEmpty()) {
                throw ApiException.invalid(key, "This detail can't be changed here.");
            }
        }
        if (changes.isEmpty()) {
            throw ApiException.invalid(null, "Nothing changed: these are already your details.");
        }

        employees.lockById(me.getId());
        if (requests.existsByEmployeeIdAndStatus(me.getId(), ProfileChangeRequest.STATUS_PENDING)) {
            throw ApiException.conflict(null, "You already have a profile update waiting for HR. Cancel it to send a new one.");
        }
        ProfileChangeRequest saved;
        try {
            saved = requests.saveAndFlush(ProfileChangeRequest.ask(me.getId(), JSON.writeValueAsString(changes),
                    JSON.writeValueAsString(previous)));
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict(null, "You already have a profile update waiting for HR.");
        }
        audit.save(AuditEntry.of(userId, "PROFILE_CHANGE_REQUESTED", "EMPLOYEE", me.getEmployeeCode(), fieldsJson(changes)));
        notifications.profileChangeRequested(me, labels(changes));
        return response(saved, me, true);
    }

    @Transactional
    public ProfileChangeResponse cancel(long userId, long requestId) {
        Employee me = currentEmployee(userId);
        employees.lockById(me.getId());
        ProfileChangeRequest request = requests.findForUpdate(requestId)
                .filter(r -> r.getEmployeeId().equals(me.getId()))
                .orElseThrow(() -> ApiException.notFound("Profile update request not found."));
        if (!ProfileChangeRequest.STATUS_PENDING.equals(request.getStatus())) {
            throw ApiException.conflict(null, "This request was already "
                    + request.getStatus().toLowerCase(Locale.ROOT) + ", so it can't be cancelled.");
        }
        request.cancel(clock.instant());
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(userId, "PROFILE_CHANGE_CANCELLED", "EMPLOYEE", me.getEmployeeCode()));
        return response(request, me, true);
    }

    /* ---------- HR ---------- */

    @Transactional(readOnly = true)
    public List<ProfileChangeResponse> withStatus(String status) {
        String wanted = status == null || status.isBlank() ? ProfileChangeRequest.STATUS_PENDING : status.trim().toUpperCase(Locale.ROOT);
        if (!List.of(ProfileChangeRequest.STATUS_PENDING, ProfileChangeRequest.STATUS_APPROVED,
                ProfileChangeRequest.STATUS_REJECTED).contains(wanted)) {
            throw ApiException.invalid("status", "Choose PENDING, APPROVED or REJECTED.");
        }
        List<ProfileChangeRequest> rows = requests.findTop100ByStatusOrderByCreatedAtAscIdAsc(wanted);
        Map<Long, Employee> people = new HashMap<>();
        for (Employee e : employees.findAllById(rows.stream().map(ProfileChangeRequest::getEmployeeId).collect(Collectors.toSet()))) {
            people.put(e.getId(), e);
        }
        return rows.stream().map(r -> response(r, people.get(r.getEmployeeId()), false)).toList();
    }

    @Transactional(readOnly = true)
    public long pendingCount() {
        return requests.countByStatus(ProfileChangeRequest.STATUS_PENDING);
    }

    /** HR: an employee's personal details in full. */
    @Transactional(readOnly = true)
    public PersonalDetailsResponse detailsFor(long employeeId) {
        Employee e = employees.findById(employeeId).orElseThrow(() -> ApiException.notFound("Employee not found."));
        return PersonalDetailsResponse.of(e, false, pendingId(e.getId()));
    }

    /** HR approves: every asked-for value is checked again and saved, once. */
    @Transactional
    public ProfileChangeResponse approve(long requestId, String note, Long reviewerUserId) {
        ProfileChangeRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId())
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        Map<String, String> changes = read(request.getChanges());
        for (Map.Entry<String, String> change : changes.entrySet()) {
            ProfileField field = ProfileField.byKey(change.getKey())
                    .orElseThrow(() -> ApiException.conflict(null, "This request has a detail that can't be changed."));
            employee.setPersonalDetail(field, field.clean(change.getValue()));
        }
        employees.saveAndFlush(employee);
        request.decide(ProfileChangeRequest.STATUS_APPROVED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "PROFILE_CHANGE_APPROVED", "EMPLOYEE", employee.getEmployeeCode(), fieldsJson(changes)));
        notifications.profileChangeDecided(employee, true, request.getReviewNote());
        return response(request, employee, false);
    }

    @Transactional
    public ProfileChangeResponse reject(long requestId, String note, Long reviewerUserId) {
        ProfileChangeRequest request = pendingLocked(requestId);
        Employee employee = employees.findById(request.getEmployeeId()).orElse(null);
        request.decide(ProfileChangeRequest.STATUS_REJECTED, reviewerUserId, clock.instant(), HrTimesheetService.cleanNote(note));
        requests.saveAndFlush(request);
        audit.save(AuditEntry.of(reviewerUserId, "PROFILE_CHANGE_REJECTED", "EMPLOYEE",
                employee == null ? String.valueOf(request.getEmployeeId()) : employee.getEmployeeCode()));
        notifications.profileChangeDecided(employee, false, request.getReviewNote());
        return response(request, employee, false);
    }

    /* ---------- Helpers ---------- */

    private ProfileChangeRequest pendingLocked(long requestId) {
        ProfileChangeRequest peek = requests.findById(requestId)
                .orElseThrow(() -> ApiException.notFound("Profile update request not found."));
        employees.lockById(peek.getEmployeeId());
        ProfileChangeRequest request = requests.findForUpdate(requestId)
                .orElseThrow(() -> ApiException.notFound("Profile update request not found."));
        if (!ProfileChangeRequest.STATUS_PENDING.equals(request.getStatus())) {
            throw ApiException.conflict(null, "This request was already " + request.getStatus().toLowerCase(Locale.ROOT) + ".");
        }
        return request;
    }

    private Long pendingId(long employeeId) {
        return requests.findTop20ByEmployeeIdOrderByCreatedAtDescIdDesc(employeeId).stream()
                .filter(r -> ProfileChangeRequest.STATUS_PENDING.equals(r.getStatus()))
                .map(ProfileChangeRequest::getId).findFirst().orElse(null);
    }

    private ProfileChangeResponse response(ProfileChangeRequest r, Employee e, boolean forEmployee) {
        Map<String, String> changes = read(r.getChanges());
        Map<String, String> previous = read(r.getPrevious());
        List<ProfileChangeResponse.Item> items = new ArrayList<>();
        for (Map.Entry<String, String> change : changes.entrySet()) {
            ProfileField field = ProfileField.byKey(change.getKey()).orElse(null);
            if (field == null) {
                continue;
            }
            boolean mask = forEmployee && field.sensitive();
            String before = previous.get(change.getKey());
            items.add(new ProfileChangeResponse.Item(field.key(), field.label(),
                    mask ? ProfileField.mask(before) : before,
                    mask ? ProfileField.mask(change.getValue()) : change.getValue()));
        }
        return new ProfileChangeResponse(r.getId(), r.getEmployeeId(),
                e == null ? null : e.getEmployeeCode(),
                e == null ? null : e.displayName(),
                r.getStatus(), r.getCreatedAt(), r.getReviewedAt(), r.getReviewNote(), r.getCancelledAt(), items);
    }

    private static Map<String, String> read(String json) {
        return json == null || json.isBlank() ? new LinkedHashMap<>() : JSON.readValue(json, MAP);
    }

    private static List<String> labels(Map<String, String> changes) {
        return changes.keySet().stream().map(k -> ProfileField.byKey(k).map(ProfileField::label).orElse(k)).toList();
    }

    /** {"fields":["phone","bankIfsc"]}: which fields, never their values. */
    private static String fieldsJson(Map<String, String> changes) {
        return JSON.writeValueAsString(Map.of("fields", List.copyOf(changes.keySet())));
    }

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId).orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }
}
