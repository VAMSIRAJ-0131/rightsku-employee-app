package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-layer tests for "Forgot password": public endpoints, one fixed answer
 * for every code request, and the generic code error. Service mocked.
 */
@WebMvcTest(
        controllers = PasswordResetController.class,
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class})
class PasswordResetControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PasswordResetService resets;

    @MockitoBean
    private AppUserRepository appUserRepository;

    @Test
    void theStatusSaysWhetherEmailIsSetUpWithoutSigningIn() throws Exception {
        when(resets.available()).thenReturn(false);
        mockMvc.perform(get("/api/auth/password-reset"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emailDelivery").value(false));
    }

    @Test
    void everyCodeRequestGetsTheSameAnswer() throws Exception {
        String expected = "{\"message\":\"" + PasswordResetController.SENT_MESSAGE + "\"}";
        for (String id : new String[] {"10002", "NOBODY1", "hr@rightsku.com"}) {
            mockMvc.perform(post("/api/auth/password-reset/request")
                            .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + id + "\"}"))
                    .andExpect(status().isAccepted())
                    .andExpect(content().json(expected, true));
        }
    }

    @Test
    void aBlankIdIsRefusedBeforeAnyLookup() throws Exception {
        mockMvc.perform(post("/api/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"  \"}"))
                .andExpect(status().isBadRequest());
        verify(resets, never()).request(anyString());
    }

    @Test
    void withoutEmailSetUpTheRequestSays503ForEveryone() throws Exception {
        doThrow(ApiException.unavailable(PasswordResetService.NOT_SET_UP)).when(resets).request(anyString());

        mockMvc.perform(post("/api/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"10002\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value(PasswordResetService.NOT_SET_UP));
    }

    @Test
    void aWrongCodeGetsTheGenericFieldError() throws Exception {
        doThrow(ApiException.invalid("code", PasswordResetService.WRONG_CODE)).when(resets).confirm(any(), anyString());

        mockMvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"10002\",\"code\":\"123456\",\"newPassword\":\"Test-Only-New-1\","
                                + "\"confirmPassword\":\"Test-Only-New-1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.code").value(PasswordResetService.WRONG_CODE));
    }

    @Test
    void theRightCodeAnswers204() throws Exception {
        mockMvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"10002\",\"code\":\"123456\",\"newPassword\":\"Test-Only-New-1\","
                                + "\"confirmPassword\":\"Test-Only-New-1\"}"))
                .andExpect(status().isNoContent());
        verify(resets).confirm(any(), anyString());
    }
}
