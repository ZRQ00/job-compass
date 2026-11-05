package com.jobcompass.service;

/** The model answered, but not with something we can use. Maps to HTTP 502. */
public class AiResponseException extends RuntimeException {
    public AiResponseException(String message) {
        super(message);
    }
}
