package eowyn.perf;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;

import java.time.Duration;
import java.time.LocalDate;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

/**
 * S3 - Carga mixta: lecturas, CRUD temporal de catálogo y préstamos.
 * 45% libros, 20% categorías, 10% categorías CRUD, 15% libros CRUD,
 * 10% ciclo de préstamo. 20 usuarios concurrentes durante 8 minutos.
 */
public class MixedLoadSimulation extends Simulation {

  private final HttpProtocolBuilder httpProtocol = http
      .baseUrl(Fixtures.BASE_URL)
      .acceptHeader("application/json")
      .contentTypeHeader("application/json");

  private final ScenarioBuilder scenario = scenario("S3 - Carga mixta")
      .feed(csv("perf-users.csv").circular())
      .exec(session -> session.set("token", Fixtures.userToken(session.getString("email"))))
      .exec(session -> session
          .set("page", 1 + (int) (Math.random() * 3))
          .set("limit", new int[]{5, 10, 20}[(int) (Math.random() * 3)])
          .set("categoryId", Fixtures.randomCategoryId())
          .set("bookId", Fixtures.randomBookId())
          .set("dueDate", LocalDate.now().plusDays(7).toString()))
      .randomSwitch().on(
          percent(45.0).then(
              exec(http("GET /api/books")
                  .get("/api/books?page=#{page}&limit=#{limit}")
                  .header("Authorization", "Bearer #{token}")
                  .check(status().is(200)))
          ),
          percent(20.0).then(
              exec(http("GET /api/categories")
                  .get("/api/categories?page=#{page}&limit=#{limit}")
                  .header("Authorization", "Bearer #{token}")
                  .check(status().is(200)))
          ),
          percent(10.0).then(
              exec(session -> session
                  .set("catName", Fixtures.unique("GTL-CAT"))
                  .set("catDescription", "Categoría temporal creada por Gatling"))
                  .exec(http("POST /api/categories")
                      .post("/api/categories")
                      .header("Authorization", "Bearer #{token}")
                      .body(StringBody(
                          "{\"name\":\"#{catName}\",\"description\":\"#{catDescription}\"}"))
                      .check(status().is(201), jsonPath("$.id").saveAs("newCategoryId")))
                  .exec(http("DELETE /api/categories/{id}")
                      .delete("/api/categories/#{newCategoryId}")
                      .header("Authorization", "Bearer #{token}")
                      .check(status().is(204)))
          ),
          percent(15.0).then(
              exec(session -> session
                  .set("bookTitle", Fixtures.unique("GTL-BOOK"))
                  .set("bookIsbn", Fixtures.unique("GTLISBN")))
                  .exec(http("POST /api/books")
                      .post("/api/books")
                      .header("Authorization", "Bearer #{token}")
                      .body(StringBody(
                          "{\"title\":\"#{bookTitle}\",\"author\":\"Gatling Author\"," +
                              "\"isbn\":\"#{bookIsbn}\",\"publicationYear\":2021," +
                              "\"categoryId\":#{categoryId},\"totalQuantity\":2," +
                              "\"availableQuantity\":2}"))
                      .check(status().is(201), jsonPath("$.id").saveAs("newBookId")))
                  .exec(http("DELETE /api/books/{id}")
                      .delete("/api/books/#{newBookId}")
                      .header("Authorization", "Bearer #{token}")
                      .check(status().is(204)))
          ),
          percent(10.0).then(
              exec(http("POST /api/loans")
                  .post("/api/loans")
                  .header("Authorization", "Bearer #{token}")
                  .body(StringBody(
                      "{\"userId\":#{userId},\"bookId\":#{bookId},\"dueDate\":\"#{dueDate}\"}"))
                  .check(status().is(201), jsonPath("$.id").saveAs("loanId")))
                  .exec(http("PUT /api/loans/{id}/return")
                      .put("/api/loans/#{loanId}/return")
                      .header("Authorization", "Bearer #{token}")
                      .check(status().is(200)))
          )
      )
      .pause(Duration.ofMillis(200), Duration.ofMillis(800));

  @Override
  public void before() {
    Fixtures.load();
  }

  {
    setUp(
        scenario.injectClosed(
            rampConcurrentUsers(0).to(20).during(Duration.ofSeconds(30)),
            constantConcurrentUsers(20).during(Duration.ofMinutes(8))
        ).protocols(httpProtocol)
    ).assertions(
        details("GET /api/books").responseTime().percentile(95).lt(300),
        details("GET /api/categories").responseTime().percentile(95).lt(300),
        details("POST /api/loans").responseTime().percentile(95).lt(800),
        global().failedRequests().percent().lt(2.0)
    );
  }
}
