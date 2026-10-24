package com.rightsku.employee_app;

import java.io.IOException;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * HR Admins upload, replace, view and remove an employee's profile photo.
 * /api/hr/** requires the HR_ADMIN role, so employees get 403 here.
 */
@RestController
@RequestMapping("/api/hr/employees/{employeeId}/photo")
public class HrEmployeePhotoController {

    private final EmployeePhotoService photos;

    public HrEmployeePhotoController(EmployeePhotoService photos) {
        this.photos = photos;
    }

    @PutMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void upload(@PathVariable long employeeId, @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) throws IOException {
        photos.upload(employeeId, file.getBytes(), Long.valueOf(jwt.getSubject()));
    }

    @GetMapping
    public ResponseEntity<byte[]> view(@PathVariable long employeeId) {
        return image(photos.forHr(employeeId));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable long employeeId, @AuthenticationPrincipal Jwt jwt) {
        photos.remove(employeeId, Long.valueOf(jwt.getSubject()));
    }

    /** The image, never cached by the browser or a proxy, and never sniffed as another type. */
    static ResponseEntity<byte[]> image(EmployeePhotoService.Photo photo) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .contentLength(photo.content().length)
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(photo.content());
    }
}
