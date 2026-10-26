package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * HR exports as CSV files that open in Excel: employees, and leave,
 * timesheets and Comp-Off for one month.
 *
 * <ul>
 *   <li>UTF-8 with a byte order mark, so Excel shows ₹, é etc. correctly.</li>
 *   <li>A cell that starts with = + - @ (or a tab) gets a leading ' so Excel
 *       never runs it as a formula (CSV injection).</li>
 *   <li>Bank account numbers are left out unless HR asks for them, and every
 *       export is recorded in the audit log.</li>
 * </ul>
 */
@Service
public class ExportService {

    public enum Kind { EMPLOYEES, LEAVE, TIMESHEETS, COMP_OFF }

    public record CsvFile(String fileName, byte[] content) {
    }

    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter MONTH_NAME = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final byte[] BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

    private final EmployeeRepository employees;
    private final LeaveRequestRepository leaves;
    private final TimesheetEntryRepository timesheets;
    private final CompOffRequestRepository compOffs;
    private final AuditEntryRepository audit;

    public ExportService(EmployeeRepository employees, LeaveRequestRepository leaves, TimesheetEntryRepository timesheets,
            CompOffRequestRepository compOffs, AuditEntryRepository audit) {
        this.employees = employees;
        this.leaves = leaves;
        this.timesheets = timesheets;
        this.compOffs = compOffs;
        this.audit = audit;
    }

    @Transactional
    public CsvFile export(String kindName, String monthText, boolean withBank, Long actorUserId) {
        Kind kind = parseKind(kindName);
        Map<Long, Employee> people = new HashMap<>();
        for (Employee e : employees.findAll()) {
            people.put(e.getId(), e);
        }
        StringBuilder csv = new StringBuilder();
        String what;
        String fileName;
        if (kind == Kind.EMPLOYEES) {
            what = "Employees" + (withBank ? " (with bank details)" : "");
            fileName = "employees.csv";
            row(csv, "Employee ID", "Name", "Email", "Phone", "Department", "Job title", "Joining date", "Status", "Gender",
                    "Address", "Emergency contact", "Emergency phone", "Bank account holder", "Bank account number", "IFSC");
            people.values().stream().sorted(Comparator.comparing(Employee::getEmployeeCode, String.CASE_INSENSITIVE_ORDER))
                    .forEach(e -> row(csv, e.getEmployeeCode(), e.displayName(), e.getUser() == null ? null : e.getUser().getEmail(),
                            e.getPhone(), e.getDepartment(), e.getJobTitle(), date(e.getJoiningDate()), e.getEmploymentStatus(),
                            e.getGender(), e.getAddress(), e.getEmergencyContactName(), e.getEmergencyContactPhone(),
                            e.getBankAccountName(),
                            withBank ? e.getBankAccountNumber() : ProfileField.mask(e.getBankAccountNumber()),
                            e.getBankIfsc()));
        } else {
            YearMonth month = parseMonth(monthText);
            LocalDate from = month.atDay(1);
            LocalDate to = month.atEndOfMonth();
            String suffix = "-" + month + ".csv";
            switch (kind) {
                case LEAVE -> {
                    what = "Leave · " + MONTH_NAME.format(month);
                    fileName = "leave" + suffix;
                    row(csv, "Employee ID", "Name", "Leave type", "From", "To", "Days", "Status", "Reason", "Applied on",
                            "Decided on", "HR note");
                    for (LeaveRequest r : leaves.overlapping(from, to)) {
                        Employee e = people.get(r.getEmployeeId());
                        row(csv, code(e), name(e), LeaveType.valueOf(r.getLeaveType()).label(), date(r.getStartDate()),
                                date(r.getEndDate()), number(r.getDays()), status(r.getStatus()), r.getReason(),
                                instant(r.getCreatedAt()), instant(r.getReviewedAt()), r.getReviewNote());
                    }
                }
                case TIMESHEETS -> {
                    what = "Timesheets · " + MONTH_NAME.format(month);
                    fileName = "timesheets" + suffix;
                    row(csv, "Employee ID", "Name", "Date", "Day", "Hours", "Status", "Description", "HR note");
                    for (TimesheetEntry t : timesheets.findByWorkDateBetweenOrderByWorkDateAscEmployeeIdAsc(from, to)) {
                        Employee e = people.get(t.getEmployeeId());
                        row(csv, code(e), name(e), date(t.getWorkDate()),
                                t.getWorkDate().getDayOfWeek().getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH),
                                number(t.getHours()), status(t.getStatus()), t.getDescription(), t.getReviewNote());
                    }
                }
                default -> {
                    what = "Comp-Off · " + MONTH_NAME.format(month);
                    fileName = "comp-off" + suffix;
                    row(csv, "Employee ID", "Name", "Worked on", "Days", "Status", "Reason", "Applied on", "Decided on", "HR note");
                    for (CompOffRequest r : compOffs.findByWorkDateBetweenOrderByWorkDateAscIdAsc(from, to)) {
                        Employee e = people.get(r.getEmployeeId());
                        row(csv, code(e), name(e), date(r.getWorkDate()), number(r.getDays()), status(r.getStatus()),
                                r.getReason(), instant(r.getCreatedAt()), instant(r.getReviewedAt()), r.getReviewNote());
                    }
                }
            }
        }
        audit.save(AuditEntry.of(actorUserId, "DATA_EXPORTED", "EXPORT", kind.name(),
                "{\"export\":\"" + what.replace("\"", "") + "\"}"));
        byte[] body = csv.toString().getBytes(StandardCharsets.UTF_8);
        byte[] withBom = new byte[BOM.length + body.length];
        System.arraycopy(BOM, 0, withBom, 0, BOM.length);
        System.arraycopy(body, 0, withBom, BOM.length, body.length);
        return new CsvFile("rightcentral-" + fileName, withBom);
    }

    static Kind parseKind(String value) {
        try {
            return Kind.valueOf(value.trim().toUpperCase(Locale.ROOT).replace('-', '_'));
        } catch (RuntimeException e) {
            throw ApiException.invalid("kind", "Choose employees, leave, timesheets or comp-off.");
        }
    }

    static YearMonth parseMonth(String value) {
        if (value == null || value.isBlank()) {
            throw ApiException.invalid("month", "Choose the month, like 2026-10.");
        }
        try {
            YearMonth month = YearMonth.parse(value.trim());
            if (month.getYear() < 2000 || month.getYear() > 2100) {
                throw ApiException.invalid("month", "Choose a month between 2000 and 2100.");
            }
            return month;
        } catch (DateTimeParseException e) {
            throw ApiException.invalid("month", "Choose the month, like 2026-10.");
        }
    }

    /** One CSV line; quotes where needed, and formula-looking cells made plain text. */
    static void row(StringBuilder csv, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                csv.append(',');
            }
            csv.append(cell(cells[i]));
        }
        csv.append("\r\n");
    }

    static String cell(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static String code(Employee e) {
        return e == null ? null : e.getEmployeeCode();
    }

    private static String name(Employee e) {
        return e == null ? null : e.displayName();
    }

    private static String date(LocalDate d) {
        return d == null ? null : DATE.format(d);
    }

    private static String instant(Instant at) {
        return at == null ? null : DATE.format(at.atZone(INDIA).toLocalDate());
    }

    private static String number(BigDecimal n) {
        return n == null ? null : n.stripTrailingZeros().toPlainString();
    }

    private static String status(String s) {
        return s == null ? null : s.charAt(0) + s.substring(1).toLowerCase(Locale.ROOT);
    }
}
