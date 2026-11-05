package com.jobcompass.eval;

/** One way of running the extraction prompt: a local Ollama model. */
public interface ExtractionBackend {

    String name();

    /** Returns the model's raw JSON answer. */
    String complete(String system, String user);
}
