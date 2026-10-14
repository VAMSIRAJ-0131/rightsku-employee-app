package com.rightsku.employee_app;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The company clock. "Today" for timesheets, holidays and schedules is the
 * date in the company time zone (app.time-zone, default Asia/Kolkata), not the
 * server's own time zone. Tests use a fixed clock instead.
 */
@Configuration
public class TimeConfig {

    @Bean
    public Clock companyClock(@Value("${app.time-zone:Asia/Kolkata}") String zone) {
        return Clock.system(ZoneId.of(zone));
    }
}
