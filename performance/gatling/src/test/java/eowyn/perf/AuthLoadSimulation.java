package eowyn.perf;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;

import java.time.Duration;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

/**
 * S1 - Carga de autenticación.
 * 10 usuarios concurrentes durante 3 minutos sobre POST /api/auth/login.
 */
public class AuthLoadSimulation extends Simulation {

  private final HttpProtocolBuilder httpProtocol = http
      .baseUrl(Fixtures.BASE_URL)
      .acceptHeader("application/json")
      .contentTypeHeader("application/json");

  private final ScenarioBuilder scenario = scenario("S1 - Login")
      .feed(csv("perf-users.csv").circular())
      .exec(http("POST /api/auth/login")
          .post("/api/auth/login")
          .body(StringBody("{\"email\":\"#{email}\",\"password\":\"#{password}\"}"))
          .check(status().is(200), jsonPath("$.token").exists()))
      .pause(Duration.ofSeconds(1));

  {
    setUp(
        scenario.injectClosed(
            rampConcurrentUsers(0).to(10).during(Duration.ofSeconds(30)),
            constantConcurrentUsers(10).during(Duration.ofMinutes(3))
        ).protocols(httpProtocol)
    ).assertions(
        details("POST /api/auth/login").responseTime().percentile(95).lt(800),
        details("POST /api/auth/login").responseTime().percentile(99).lt(1500),
        global().failedRequests().percent().lt(1.0)
    );
  }
}
