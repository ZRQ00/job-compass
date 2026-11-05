CREATE TABLE resume (
    id         INTEGER   PRIMARY KEY,
    text       TEXT      NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
INSERT INTO resume (id, text) VALUES (1, '');

-- Built-in job sites: can be hidden but not deleted.
INSERT INTO boards (name, home, search, position, builtin, hidden) VALUES
 ('LinkedIn',  'https://www.linkedin.com/jobs/',  'https://www.linkedin.com/jobs/search/?keywords={query}&location={location}', 0, TRUE, FALSE),
 ('Indeed',    'https://www.indeed.com/',         'https://www.indeed.com/jobs?q={query}&l={location}', 1, TRUE, FALSE),
 ('Glassdoor', 'https://www.glassdoor.com/Job/',  'https://www.glassdoor.com/Job/jobs.htm?sc.keyword={query}&locKeyword={location}', 2, TRUE, FALSE);
