package com.jobcompass;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class JobCompassApplication {
    public static void main(String[] args) {
        SpringApplication.run(JobCompassApplication.class, args);
    }
}
