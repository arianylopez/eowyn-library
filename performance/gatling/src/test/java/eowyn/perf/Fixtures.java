package eowyn.perf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Datos y utilidades compartidas por las simulaciones de Gatling.
 *
 * Los libros y categorías PERF se descubren por API, de modo que los IDs no
 * están codificados en las pruebas. Requiere haber ejecutado:
 *   node performance/scripts/seed-perf-data.js
 */
public final class Fixtures {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final HttpClient CLIENT = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(5))
      .build();
  private static final AtomicLong SEQUENCE = new AtomicLong();

  public static final String BASE_URL =
      System.getenv().getOrDefault("BASE_URL", "http://localhost:3000");
  public static final String ADMIN_EMAIL =
      System.getenv().getOrDefault("ADMIN_EMAIL", "admin@example.com");
  public static final String ADMIN_PASSWORD =
      System.getenv().getOrDefault("ADMIN_PASSWORD", "123456");

  public static String adminToken;
  public static final List<Integer> bookIds = new ArrayList<>();
  public static final List<Integer> categoryIds = new ArrayList<>();

  private Fixtures() {
  }

  /** Se invoca una vez antes de cada simulación. */
  public static void load() {
    adminToken = login(ADMIN_EMAIL, ADMIN_PASSWORD);

    JsonNode books = getJson("/api/books?page=1&limit=200", adminToken);
    bookIds.clear();
    books.path("books").forEach(book -> {
      if (book.path("title").asText().startsWith("PERF Book ")) {
        bookIds.add(book.path("id").asInt());
      }
    });

    JsonNode categories = getJson("/api/categories?page=1&limit=100", adminToken);
    categoryIds.clear();
    categories.path("categories").forEach(category -> {
      if (category.path("name").asText().startsWith("PERF Category ")) {
        categoryIds.add(category.path("id").asInt());
      }
    });

    if (bookIds.isEmpty() || categoryIds.isEmpty()) {
      throw new IllegalStateException(
          "No se encontraron fixtures PERF. Ejecuta: node performance/scripts/seed-perf-data.js");
    }
  }

  public static String login(String email, String password) {
    try {
      String body = MAPPER.writeValueAsString(Map.of("email", email, "password", password));
      HttpRequest request = HttpRequest.newBuilder(URI.create(BASE_URL + "/api/auth/login"))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body))
          .build();
      HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200) {
        throw new IllegalStateException(
            "Login de " + email + " devolvió HTTP " + response.statusCode());
      }
      return MAPPER.readTree(response.body()).path("token").asText();
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("Error autenticando " + email, e);
    }
  }

  public static JsonNode getJson(String path, String token) {
    try {
      HttpRequest request = HttpRequest.newBuilder(URI.create(BASE_URL + path))
          .header("Authorization", "Bearer " + token)
          .GET()
          .build();
      HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200) {
        throw new IllegalStateException(
            "GET " + path + " devolvió HTTP " + response.statusCode());
      }
      return MAPPER.readTree(response.body());
    } catch (IllegalStateException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("Error consultando " + path, e);
    }
  }

  public static int randomBookId() {
    return bookIds.get(ThreadLocalRandom.current().nextInt(bookIds.size()));
  }

  public static int randomCategoryId() {
    return categoryIds.get(ThreadLocalRandom.current().nextInt(categoryIds.size()));
  }

  public static String unique(String prefix) {
    return prefix + "-" + System.currentTimeMillis() + "-" + SEQUENCE.incrementAndGet();
  }
}
