package com.jobcompass.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.jobcompass.dto.BoardOut;
import com.jobcompass.entity.Board;
import com.jobcompass.repo.BoardRepository;
import com.jobcompass.web.ApiException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BoardService {

    private final BoardRepository repo;

    public BoardService(BoardRepository repo) {
        this.repo = repo;
    }

    /**
     * A pasted URL either contains the JOBCOMPASS (and optionally JCLOC) marker, in which case it becomes a
     * search template, or it is saved as a plain bookmark.
     * Returns {home, search}; search is null for bookmarks.
     */
    public static String[] derive(String raw) {
        String url = raw == null ? "" : raw.strip();
        URI uri;
        try {
            uri = URI.create(url.replace("{", "%7B").replace("}", "%7D"));
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "That doesn't look like a valid URL");
        }
        if (uri.getScheme() == null || uri.getHost() == null
                || !(uri.getScheme().equalsIgnoreCase("http") || uri.getScheme().equalsIgnoreCase("https"))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "URL must start with http:// or https://");
        }
        if (url.contains("JOBCOMPASS")) {
            String home = uri.getScheme() + "://" + uri.getHost() + "/";
            String search = url.replace("JOBCOMPASS", "{query}").replace("JCLOC", "{location}");
            return new String[] {home, search};
        }
        return new String[] {url, null};
    }

    @Transactional(readOnly = true)
    public List<BoardOut> list() {
        return repo.findAllByOrderByPositionAscIdAsc().stream().map(BoardOut::of).toList();
    }

    public BoardOut create(String name, String url) {
        if (name == null || name.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "name can't be empty");
        }
        String[] d = derive(url);
        Board b = new Board();
        b.setName(name.strip());
        b.setHome(d[0]);
        b.setSearch(d[1]);
        b.setPosition(repo.findAll().stream().mapToInt(Board::getPosition).max().orElse(-1) + 1);
        return BoardOut.of(repo.save(b));
    }

    public BoardOut update(long id, JsonNode body) {
        Board b = repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Board not found"));
        if (body.hasNonNull("name")) {
            if (body.get("name").asText().isBlank()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "name can't be empty");
            }
            b.setName(body.get("name").asText().strip());
        }
        if (body.hasNonNull("url")) {
            if (b.isBuiltin()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Built-in boards can only be hidden or shown");
            }
            String[] d = derive(body.get("url").asText());
            b.setHome(d[0]);
            b.setSearch(d[1]);
        }
        if (body.has("hidden")) b.setHidden(body.get("hidden").asBoolean());
        return BoardOut.of(repo.save(b));
    }

    public List<BoardOut> reorder(List<Long> ids) {
        Map<Long, Board> byId = repo.findAll().stream().collect(Collectors.toMap(Board::getId, Function.identity()));
        int pos = 0;
        for (Long id : ids) {
            Board b = byId.remove(id);
            if (b != null) b.setPosition(pos++);
        }
        // Anything not mentioned keeps its relative order after the listed ones.
        for (Board b : byId.values().stream().sorted(java.util.Comparator.comparingInt(Board::getPosition)).toList()) {
            b.setPosition(pos++);
        }
        repo.flush();
        return list();
    }

    public void delete(long id) {
        Board b = repo.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Board not found"));
        if (b.isBuiltin()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Built-in boards can be hidden but not deleted");
        }
        repo.delete(b);
    }
}
