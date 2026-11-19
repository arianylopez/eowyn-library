package eowyn.perf;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;

import java.time.Duration;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

/**
 * S2 - Carga de lectura de catálogo.
 * 50 usuarios concurrentes durante 5 minutos: 70% libros, 30% categorías.
 */
public class CatalogLoadSimulation extends Simulation {

  private final HttpProtocolBuilder httpProtocol = http
      .baseUrl(Fixtures.BASE_URL)
      .acceptHeader("application/json")
      .contentTypeHeader("application/json");

  private final ScenarioBuilder scenario = scenario("S2 - Catálogo")
      .feed(csv("perf-users.csv").circular())
      .exec(session -> session.set("token", Fixtures.userToken(session.getString("email"))))
      .exec(session -> session
          .set("page", 1 + (int) (Math.random() * 3))
          .set("limit", new int[]{5, 10, 20}[(int) (Math.random() * 3)]))
      .randomSwitch().on(
          percent(70.0).then(
              exec(http("GET /api/books")
                  .get("/api/books?page=#{page}&limit=#{limit}")
                  .header("Authorization", "Bearer #{token}")
                  .check(status().is(200), jsonPath("$.books").exists()))
          ),
          percent(30.0).then(
              exec(http("GET /api/categories")
                  .get("/api/categories?page=#{page}&limit=#{limit}")
                  .header("Authorization", "Bearer #{token}")
                  .check(status().is(200), jsonPath("$.categories").exists()))
          )
      )
      .pause(Duration.ofMillis(500), Duration.ofMillis(1500));

  @Override
  public void before() {
    Fixtures.load();
  }

  {
    setUp(
        scenario.injectClosed(
            rampConcurrentUsers(0).to(50).during(Duration.ofSeconds(60)),
            constantConcurrentUsers(50).during(Duration.ofMinutes(5))
        ).protocols(httpProtocol)
    ).assertions(
        details("GET /api/books").responseTime().percentile(95).lt(300),
        details("GET /api/books").responseTime().percentile(99).lt(600),
        details("GET /api/categories").responseTime().percentile(95).lt(300),
        details("GET /api/categories").responseTime().percentile(99).lt(600),
        global().failedRequests().percent().lt(1.0)
    );
  }
}
