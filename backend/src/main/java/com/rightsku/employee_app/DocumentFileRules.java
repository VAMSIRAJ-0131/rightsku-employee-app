package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Checks an uploaded document file before it is stored.
 *
 * <ul>
 *   <li>Not empty and not larger than the limit (default 10 MB).</li>
 *   <li>Only PDF, PNG or JPEG. The type is decided from the file's first
 *       bytes, never from its name or the browser's claim, so a renamed
 *       program or web page is refused.</li>
 *   <li>The file name is reduced to a safe base name (no folders, no control
 *       or special characters) with the extension that matches the content.</li>
 * </ul>
 * Plain Java with no Spring dependency, so it is easy to test.
 */
public final class DocumentFileRules {

    public static final long DEFAULT_MAX_BYTES = 10L * 1024 * 1024;
    static final int MAX_FILE_NAME_LENGTH = 120;

    private static final byte[] PDF = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

    /** A file that passed every check. */
    public record CheckedFile(String fileName, String contentType, byte[] bytes, String sha256) {
    }

    private DocumentFileRules() {
    }

    /** Throws IllegalArgumentException with a plain message if the file is not acceptable. */
    public static CheckedFile check(String originalName, byte[] bytes, long maxBytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("Choose a file to upload. Empty files can't be used.");
        }
        if (bytes.length > maxBytes) {
            throw new IllegalArgumentException("The file is larger than " + megabytes(maxBytes) + " MB.");
        }
        String contentType = detectContentType(bytes);
        if (contentType == null) {
            throw new IllegalArgumentException("Only PDF, PNG or JPG files can be uploaded.");
        }
        return new CheckedFile(safeFileName(originalName, contentType), contentType, bytes, sha256(bytes));
    }

    /** application/pdf, image/png or image/jpeg from the first bytes; null for anything else. */
    static String detectContentType(byte[] bytes) {
        if (startsWith(bytes, PDF)) {
            return "application/pdf";
        }
        if (startsWith(bytes, PNG)) {
            return "image/png";
        }
        if (startsWith(bytes, JPEG)) {
            return "image/jpeg";
        }
        return null;
    }

    /**
     * Keeps only the last part of the name (no folders), removes control and
     * special characters, shortens it, and sets the extension that matches the
     * real content (so "payslip.exe" holding a PDF is stored as "payslip.pdf").
     */
    static String safeFileName(String originalName, String contentType) {
        String extension = switch (contentType) {
            case "application/pdf" -> ".pdf";
            case "image/png" -> ".png";
            default -> ".jpg";
        };
        String name = originalName == null ? "" : originalName;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        name = name.substring(slash + 1);
        name = name.replaceAll("[\\p{Cntrl}\"<>:|?*%;]", "").strip();
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : (dot == 0 ? "" : name);
        base = base.replaceAll("^[.\\s]+", "").strip();
        if (base.isEmpty()) {
            base = "document";
        }
        if (base.length() > MAX_FILE_NAME_LENGTH) {
            base = base.substring(0, MAX_FILE_NAME_LENGTH).strip();
        }
        return base + extension;
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (bytes[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    private static String megabytes(long bytes) {
        long mb = bytes / (1024 * 1024);
        return mb > 0 ? String.valueOf(mb) : String.format(Locale.ROOT, "%.2f", bytes / (1024.0 * 1024));
    }
}
