package eowyn.perf;

import io.gatling.javaapi.core.ScenarioBuilder;
import io.gatling.javaapi.core.Simulation;
import io.gatling.javaapi.http.HttpProtocolBuilder;

import java.time.Duration;
import java.time.LocalDate;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

/**
 * S4 - Ciclo de préstamo con contención.
 * 20 usuarios concurrentes crean y devuelven préstamos durante 4 minutos.
 * Se mide por separado la creación y la devolución.
 */
public class LoanCycleSimulation extends Simulation {

  private final HttpProtocolBuilder httpProtocol = http
      .baseUrl(Fixtures.BASE_URL)
      .acceptHeader("application/json")
      .contentTypeHeader("application/json");

  private final ScenarioBuilder scenario = scenario("S4 - Préstamos")
      .feed(csv("perf-users.csv").circular())
      .exec(session -> session.set("token", Fixtures.userToken(session.getString("email"))))
      .exec(session -> session
          .set("bookId", Fixtures.randomBookId())
          .set("dueDate", LocalDate.now().plusDays(7).toString()))
      .exec(http("POST /api/loans")
          .post("/api/loans")
          .header("Authorization", "Bearer #{token}")
          .body(StringBody(
              "{\"userId\":#{userId},\"bookId\":#{bookId},\"dueDate\":\"#{dueDate}\"}"))
          .check(status().is(201), jsonPath("$.id").saveAs("loanId")))
      .exec(http("PUT /api/loans/{id}/return")
          .put("/api/loans/#{loanId}/return")
          .header("Authorization", "Bearer #{token}")
          .check(status().is(200), jsonPath("$.status").is("returned")))
      .pause(Duration.ofMillis(200), Duration.ofMillis(500));

  @Override
  public void before() {
    Fixtures.load();
  }

  {
    setUp(
        scenario.injectClosed(
            rampConcurrentUsers(0).to(20).during(Duration.ofSeconds(30)),
            constantConcurrentUsers(20).during(Duration.ofMinutes(4))
        ).protocols(httpProtocol)
    ).assertions(
        details("POST /api/loans").responseTime().percentile(95).lt(800),
        details("POST /api/loans").responseTime().percentile(99).lt(1500),
        details("PUT /api/loans/{id}/return").responseTime().percentile(95).lt(800),
        global().failedRequests().percent().lt(1.0)
    );
  }
}
