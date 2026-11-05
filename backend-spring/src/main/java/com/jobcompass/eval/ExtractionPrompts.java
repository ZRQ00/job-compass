package com.jobcompass.eval;

import java.util.LinkedHashMap;
import java.util.Map;

/** Prompt variants for field extraction. The production endpoint uses {@link #BASELINE}. */
public final class ExtractionPrompts {

    public static final String SCHEMA = """
            {"type":"object",
             "properties":{
               "company":{"type":"string"},
               "role":{"type":"string"},
               "location":{"type":"string"},
               "salary_min":{"type":["integer","null"]},
               "salary_max":{"type":["integer","null"]}},
             "required":["company","role","location","salary_min","salary_max"]}""";

    public static final String BASELINE = """
            Extract these fields from the job posting: the hiring company's name, the job title, the location, \
            and the salary range. Write 'Remote' for remote jobs, or 'Hybrid - <city>' for hybrid. If the \
            posting is from a recruiting agency, use the agency's client if one is named. Give salary_min and \
            salary_max as yearly amounts in whole dollars (convert hourly rates assuming 2080 hours); if only \
            one number is given, use it for both. Use an empty string for text fields and null for numbers \
            that are not stated. Do not guess.""";

    public static final String MINIMAL = """
            Read the job posting and return JSON with company, role, location, salary_min and salary_max \
            (yearly, whole dollars, null if not stated).""";

    public static final String STRICT = BASELINE + """


            Rules:
            - role is the title as written, without the company name, requisition numbers or location.
            - company is the employer, never the job board (LinkedIn, Indeed) and never a recruiter if the \
            client is named.
            - location is a city and state, 'Remote', or 'Hybrid - <city>'. Leave it empty if the posting \
            only describes a region in vague terms.
            - Ignore bonuses, equity and benefits when reading salary.

            Examples:
            Posting: "Acme Robotics is hiring a Staff Engineer (Req 4411) in Austin, TX. $150,000 - $180,000."
            Answer: {"company":"Acme Robotics","role":"Staff Engineer","location":"Austin, TX","salary_min":150000,"salary_max":180000}

            Posting: "Join us! Data Analyst, fully remote. Salary not disclosed."
            Answer: {"company":"","role":"Data Analyst","location":"Remote","salary_min":null,"salary_max":null}""";

    public static final Map<String, String> VARIANTS = new LinkedHashMap<>();

    static {
        VARIANTS.put("baseline", BASELINE);
        VARIANTS.put("minimal", MINIMAL);
        VARIANTS.put("strict", STRICT);
    }

    private ExtractionPrompts() {}
}
