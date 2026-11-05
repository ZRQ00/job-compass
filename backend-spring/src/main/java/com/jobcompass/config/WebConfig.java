package com.jobcompass.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;

    public WebConfig(AppProperties props) {
        this.props = props;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String origins = props.corsOrigins();
        if (origins != null && !origins.isBlank()) {
            registry.addMapping("/**")
                    .allowedOriginPatterns(origins.split("\\s*,\\s*"))
                    .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
        }
    }
}
