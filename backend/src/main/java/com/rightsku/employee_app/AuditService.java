package com.rightsku.employee_app;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The HR Activity screen: the audit log, newest first, in plain words ("HR
 * Admin approved leave for Priya Shah"). Each entry is turned into who did
 * it, what, and who or what it was about; the stored entry is never changed.
 */
@Service
public class AuditService {

    static final int PAGE_SIZE = 30;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /** Kinds of activity for the screen's filter chips. */
    static final Map<String, List<String>> CATEGORIES = Map.of(
            "approvals", List.of("LEAVE_APPROVED", "LEAVE_REJECTED", "TIMESHEET_APPROVED", "TIMESHEET_REJECTED",
                    "COMP_OFF_CREDITED", "COMP_OFF_REJECTED", "PROFILE_CHANGE_APPROVED", "PROFILE_CHANGE_REJECTED"),
            "employees", List.of("EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_ACTIVATED", "EMPLOYEE_DEACTIVATED",
                    "PASSWORD_RESET_BY_HR", "PHOTO_UPLOADED", "PHOTO_REPLACED", "PHOTO_REMOVED", "SCHEDULE_CHANGED",
                    "LEAVE_BALANCE_CHANGED", "COMP_OFF_ADJUSTED"),
            "documents", List.of("DOCUMENT_UPLOADED", "DOCUMENT_REPLACED", "DOCUMENT_RENAMED", "DATA_EXPORTED"),
            "company", List.of("COMPANY_PROFILE_CHANGED", "COMPANY_ADDRESS_ADDED", "COMPANY_ADDRESS_CHANGED",
                    "HOLIDAY_ADDED", "HOLIDAY_CHANGED", "HOLIDAY_REMOVED"),
            "requests", List.of("LEAVE_CANCELLED", "COMP_OFF_CANCELLED", "PROFILE_CHANGE_REQUESTED",
                    "PROFILE_CHANGE_CANCELLED", "PASSWORD_CHANGED", "PASSWORD_RESET", "PASSWORD_RESET_REQUESTED"));

    /** What happened, in words. Unknown actions fall back to the code in lower case. */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("LEAVE_APPROVED", "Approved leave"),
            Map.entry("LEAVE_REJECTED", "Rejected leave"),
            Map.entry("LEAVE_CANCELLED", "Cancelled leave request"),
            Map.entry("TIMESHEET_APPROVED", "Approved timesheet"),
            Map.entry("TIMESHEET_REJECTED", "Rejected timesheet"),
            Map.entry("COMP_OFF_CREDITED", "Approved Comp-Off"),
            Map.entry("COMP_OFF_REJECTED", "Rejected Comp-Off"),
            Map.entry("COMP_OFF_CANCELLED", "Cancelled Comp-Off request"),
            Map.entry("COMP_OFF_ADJUSTED", "Changed Comp-Off balance"),
            Map.entry("LEAVE_BALANCE_CHANGED", "Changed leave balance"),
            Map.entry("PROFILE_CHANGE_REQUESTED", "Asked to update profile"),
            Map.entry("PROFILE_CHANGE_CANCELLED", "Cancelled profile update"),
            Map.entry("PROFILE_CHANGE_APPROVED", "Approved profile update"),
            Map.entry("PROFILE_CHANGE_REJECTED", "Rejected profile update"),
            Map.entry("EMPLOYEE_CREATED", "Added employee"),
            Map.entry("EMPLOYEE_UPDATED", "Edited employee"),
            Map.entry("EMPLOYEE_ACTIVATED", "Activated employee"),
            Map.entry("EMPLOYEE_DEACTIVATED", "Deactivated employee"),
            Map.entry("PASSWORD_RESET_BY_HR", "Reset password"),
            Map.entry("PHOTO_UPLOADED", "Added photo"),
            Map.entry("PHOTO_REPLACED", "Replaced photo"),
            Map.entry("PHOTO_REMOVED", "Removed photo"),
            Map.entry("SCHEDULE_CHANGED", "Changed weekly offs"),
            Map.entry("DOCUMENT_UPLOADED", "Uploaded document"),
            Map.entry("DOCUMENT_REPLACED", "Replaced document"),
            Map.entry("DOCUMENT_RENAMED", "Renamed document"),
            Map.entry("DATA_EXPORTED", "Exported data"),
            Map.entry("COMPANY_PROFILE_CHANGED", "Changed company profile"),
            Map.entry("COMPANY_ADDRESS_ADDED", "Added office address"),
            Map.entry("COMPANY_ADDRESS_CHANGED", "Changed office address"),
            Map.entry("HOLIDAY_ADDED", "Added holiday"),
            Map.entry("HOLIDAY_CHANGED", "Changed holiday"),
            Map.entry("HOLIDAY_REMOVED", "Removed holiday"),
            Map.entry("PASSWORD_CHANGED", "Changed own password"),
            Map.entry("PASSWORD_RESET", "Reset password with code"),
            Map.entry("PASSWORD_RESET_REQUESTED", "Asked for a password reset code"));

    private final AuditEntryRepository audit;
    private final AppUserRepository users;
    private final EmployeeRepository employees;
    private final LeaveRequestRepository leaves;
    private final CompOffRequestRepository compOffs;
    private final EmployeeDocumentRepository documents;

    public AuditService(AuditEntryRepository audit, AppUserRepository users, EmployeeRepository employees,
            LeaveRequestRepository leaves, CompOffRequestRepository compOffs, EmployeeDocumentRepository documents) {
        this.audit = audit;
        this.users = users;
        this.employees = employees;
        this.leaves = leaves;
        this.compOffs = compOffs;
        this.documents = documents;
    }

    public record Item(long id, Instant at, String actor, String action, String label, String subject, String detail) {
    }

    public record PageResponse(List<Item> items, int page, boolean hasMore, long total) {
    }

    @Transactional(readOnly = true)
    public PageResponse page(int page, String category) {
        int p = Math.max(0, Math.min(page, 10_000));
        PageRequest request = PageRequest.of(p, PAGE_SIZE);
        List<String> actions = category == null || category.isBlank() || category.equalsIgnoreCase("all")
                ? null : CATEGORIES.get(category.trim().toLowerCase(Locale.ROOT));
        if (category != null && !category.isBlank() && !category.equalsIgnoreCase("all") && actions == null) {
            throw ApiException.invalid("category", "Unknown activity kind.");
        }
        Page<AuditEntry> rows = actions == null
                ? audit.findAllByOrderByCreatedAtDescIdDesc(request)
                : audit.findByActionInOrderByCreatedAtDescIdDesc(actions, request);
        Map<Long, String> actorNames = new HashMap<>();
        List<Item> items = rows.getContent().stream().map(e -> new Item(
                e.getId(), e.getCreatedAt(),
                actorNames.computeIfAbsent(e.getActorUserId() == null ? -1L : e.getActorUserId(), this::actorName),
                e.getAction(),
                LABELS.getOrDefault(e.getAction(), e.getAction().replace('_', ' ').toLowerCase(Locale.ROOT)),
                subject(e),
                detail(e))).toList();
        return new PageResponse(items, p, rows.hasNext(), rows.getTotalElements());
    }

    /** "Priya Shah (EMP004)" for an employee account, the sign-in email for HR, "System" for none. */
    private String actorName(long userId) {
        if (userId < 0) {
            return "System";
        }
        Optional<Employee> person = employees.findByUser_Id(userId);
        if (person.isPresent()) {
            return person.get().displayName() + " (" + person.get().getEmployeeCode() + ")";
        }
        return users.findById(userId)
                .map(u -> AppUser.ROLE_HR_ADMIN.equals(u.getRole()) ? "HR Admin · " + (u.getEmail() != null ? u.getEmail() : u.getLoginId())
                        : (u.getEmail() != null ? u.getEmail() : u.getLoginId()))
                .orElse("Removed account");
    }

    /** Who or what the action was about. */
    private String subject(AuditEntry e) {
        String id = e.getEntityId();
        if (id == null) {
            return null;
        }
        try {
            return switch (e.getEntityType()) {
                case "EMPLOYEE" -> byCode(id);
                case "LEAVE_REQUEST" -> leaves.findById(Long.valueOf(id))
                        .map(r -> byId(r.getEmployeeId()) + " · " + LeaveType.valueOf(r.getLeaveType()).label() + " leave from "
                                + r.getStartDate())
                        .orElse("Leave request " + id);
                case "COMP_OFF_REQUEST" -> compOffs.findById(Long.valueOf(id))
                        .map(r -> byId(r.getEmployeeId()) + " · worked on " + r.getWorkDate())
                        .orElse("Comp-Off request " + id);
                case "TIMESHEET_WEEK" -> {
                    String[] parts = id.split("/", 2);
                    yield byCode(parts[0]) + (parts.length > 1 ? " · week of " + parts[1] : "");
                }
                case "DOCUMENT" -> documents.findById(Long.valueOf(id))
                        .map(d -> (d.getEmployee() == null ? "" : d.getEmployee().displayName() + " · ") + d.getTitle())
                        .orElse("Document " + id);
                case "HOLIDAY" -> "Holiday on " + id;
                case "USER" -> actorName(Long.parseLong(id));
                case "COMPANY" -> "Company profile";
                case "COMPANY_ADDRESS" -> "Office address";
                case "EXPORT" -> null;
                default -> e.getEntityType().toLowerCase(Locale.ROOT) + " " + id;
            };
        } catch (RuntimeException ex) {
            return id;
        }
    }

    private String byCode(String code) {
        return employees.findByEmployeeCodeIgnoreCase(code).map(p -> p.displayName() + " (" + p.getEmployeeCode() + ")").orElse(code);
    }

    private String byId(Long employeeId) {
        return employees.findById(employeeId).map(p -> p.displayName() + " (" + p.getEmployeeCode() + ")").orElse("Employee " + employeeId);
    }

    /** A short line from the stored details: balances before and after, the fields changed. */
    private static String detail(AuditEntry e) {
        if (e.getDetails() == null || e.getDetails().isBlank()) {
            return null;
        }
        try {
            JsonNode d = JSON.readTree(e.getDetails());
            if (d.has("previousDays") && d.has("newDays")) {
                return "Balance " + d.get("previousDays").asString() + " → " + d.get("newDays").asString() + " days";
            }
            if (d.has("fields") && d.get("fields").isArray()) {
                StringBuilder s = new StringBuilder();
                for (JsonNode f : d.get("fields")) {
                    String label = ProfileField.byKey(f.asString()).map(ProfileField::label).orElse(f.asString());
                    s.append(s.isEmpty() ? "" : ", ").append(label);
                }
                return s.toString();
            }
            if (d.has("export")) {
                return d.get("export").asString();
            }
            return null;
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
