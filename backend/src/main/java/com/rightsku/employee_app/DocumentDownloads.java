package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Builds the HTTP response for a document download. */
final class DocumentDownloads {

    private DocumentDownloads() {
    }

    /**
     * Always sent as an attachment (never shown inside the app's page), with
     * the stored, already-checked content type, "nosniff" so the browser does
     * not guess another type, and no caching.
     */
    static ResponseEntity<byte[]> response(DocumentService.DownloadedDocument file) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.content().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(file.content());
    }
}
