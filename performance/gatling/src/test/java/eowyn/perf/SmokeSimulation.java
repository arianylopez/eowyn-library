package eowyn.perf;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;

import java.time.Duration;
import java.time.LocalDate;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

/**
 * S0 - Smoke test de Gatling.
 * 1 usuario durante 20 s que recorre todos los flujos críticos.
 * Sirve para validar la configuración antes de las pruebas de carga.
 */
public class SmokeSimulation extends Simulation {

  private final HttpProtocolBuilder httpProtocol = http
      .baseUrl(Fixtures.BASE_URL)
      .acceptHeader("application/json")
      .contentTypeHeader("application/json");

  private final ScenarioBuilder scenario = scenario("S0 - Smoke")
      .feed(csv("perf-users.csv").circular())
      .exec(http("POST /api/auth/login")
          .post("/api/auth/login")
          .body(StringBody("{\"email\":\"#{email}\",\"password\":\"#{password}\"}"))
          .check(status().is(200), jsonPath("$.token").saveAs("token")))
      .exec(http("GET /api/books")
          .get("/api/books?page=1&limit=5")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(200)))
      .exec(http("GET /api/categories")
          .get("/api/categories?page=1&limit=5")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(200)))
      .exec(session -> session
          .set("catName", Fixtures.unique("GTL-SMOKE-CAT"))
          .set("bookTitle", Fixtures.unique("GTL-SMOKE-BOOK"))
          .set("bookIsbn", Fixtures.unique("GTL-SMOKE-ISBN"))
          .set("bookId", Fixtures.randomBookId())
          .set("dueDate", LocalDate.now().plusDays(7).toString()))
      .exec(http("POST /api/categories")
          .post("/api/categories")
          .header("Authorization", "Bearer #{token}")
          .body(StringBody(
              "{\"name\":\"#{catName}\",\"description\":\"Categoría del smoke test de Gatling\"}"))
          .check(status().is(201), jsonPath("$.id").saveAs("newCategoryId")))
      .exec(http("DELETE /api/categories/{id}")
          .delete("/api/categories/#{newCategoryId}")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(204)))
      .exec(http("POST /api/books")
          .post("/api/books")
          .header("Authorization", "Bearer #{token}")
          .body(StringBody(
              "{\"title\":\"#{bookTitle}\",\"author\":\"Gatling Author\"," +
                  "\"isbn\":\"#{bookIsbn}\",\"publicationYear\":2020," +
                  "\"categoryId\":1,\"totalQuantity\":2,\"availableQuantity\":2}"))
          .check(status().is(201), jsonPath("$.id").saveAs("newBookId")))
      .exec(http("DELETE /api/books/{id}")
          .delete("/api/books/#{newBookId}")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(204)))
      .exec(http("POST /api/loans")
          .post("/api/loans")
          .header("Authorization", "Bearer #{token}")
          .body(StringBody(
              "{\"userId\":#{userId},\"bookId\":#{bookId},\"dueDate\":\"#{dueDate}\"}"))
          .check(status().is(201), jsonPath("$.id").saveAs("loanId")))
      .exec(http("PUT /api/loans/{id}/return")
          .put("/api/loans/#{loanId}/return")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(200)))
      .pause(Duration.ofSeconds(1));

  @Override
  public void before() {
    Fixtures.load();
  }

  {
    setUp(
        scenario.injectClosed(constantConcurrentUsers(1).during(Duration.ofSeconds(20)))
            .protocols(httpProtocol)
    ).assertions(
        global().failedRequests().percent().lt(1.0),
        global().responseTime().percentile(95).lt(1500)
    );
  }
}
