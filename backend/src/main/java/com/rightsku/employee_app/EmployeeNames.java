package com.rightsku.employee_app;

import java.util.Locale;

/** How an employee's name is shown with the name prefix chosen by HR. */
final class EmployeeNames {

    private EmployeeNames() {
    }

    /** MR -> "Mr.", MS -> "Ms.", MRS -> "Mrs.", anything else -> null. */
    static String prefixLabel(String prefix) {
        if (prefix == null) {
            return null;
        }
        return switch (prefix) {
            case "MR" -> "Mr.";
            case "MS" -> "Ms.";
            case "MRS" -> "Mrs.";
            default -> null;
        };
    }

    /**
     * "Mr. Vamsi Ajjampudi". The prefix is left out when none is set, or when
     * the stored first name already starts with a title (so it is never shown
     * twice, for example "Mr. Mr. Vamsi").
     */
    static String display(String prefix, String firstName, String lastName) {
        String name = ((firstName == null ? "" : firstName.trim()) + " " + (lastName == null ? "" : lastName.trim())).trim();
        String label = prefixLabel(prefix);
        if (label == null || name.isEmpty() || startsWithTitle(name)) {
            return name;
        }
        return label + " " + name;
    }

    private static boolean startsWithTitle(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        for (String title : new String[] {"mr ", "mr. ", "ms ", "ms. ", "mrs ", "mrs. "}) {
            if (lower.startsWith(title)) {
                return true;
            }
        }
        return false;
    }
}
