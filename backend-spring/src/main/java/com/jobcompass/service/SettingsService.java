package com.jobcompass.service;

import com.jobcompass.entity.Setting;
import com.jobcompass.repo.SettingRepository;
import com.jobcompass.web.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SettingsService {

    public static final String WEEKLY_GOAL = "weekly_goal";
    public static final String FOLLOW_UP_AFTER_DAYS = "follow_up_after_days";

    private static final Map<String, int[]> DEFAULT_MIN_MAX = Map.of(
            WEEKLY_GOAL, new int[] {5, 1, 200},
            FOLLOW_UP_AFTER_DAYS, new int[] {7, 1, 365});

    private final SettingRepository repo;

    public SettingsService(SettingRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public int getInt(String key) {
        int[] d = DEFAULT_MIN_MAX.get(key);
        return repo.findById(key).map(s -> {
            try {
                return Integer.parseInt(s.getValue());
            } catch (NumberFormatException e) {
                return d[0];
            }
        }).orElse(d[0]);
    }

    @Transactional(readOnly = true)
    public Map<String, Integer> all() {
        Map<String, Integer> out = new LinkedHashMap<>();
        out.put(WEEKLY_GOAL, getInt(WEEKLY_GOAL));
        out.put(FOLLOW_UP_AFTER_DAYS, getInt(FOLLOW_UP_AFTER_DAYS));
        return out;
    }

    public Map<String, Integer> update(Map<String, Object> changes) {
        for (var e : changes.entrySet()) {
            int[] d = DEFAULT_MIN_MAX.get(e.getKey());
            if (d == null) continue; // ignore unknown keys
            if (!(e.getValue() instanceof Number n) || n.intValue() < d[1] || n.intValue() > d[2]) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                        e.getKey() + " must be a number between " + d[1] + " and " + d[2]);
            }
            Setting s = repo.findById(e.getKey()).orElseGet(() -> new Setting(e.getKey(), ""));
            s.setValue(String.valueOf(n.intValue()));
            repo.save(s);
        }
        return all();
    }
}
