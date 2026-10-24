# RIGHTSKU Employee App backend: Spring Boot on Java 25.
# Built by deploy/docker-compose.yml. Tests are not run here: run them on a
# development machine before every deploy (.\mvnw.cmd test).

# ---- Build: compile the jar with the full JDK ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
# mvnw may arrive with Windows line endings or without the execute bit.
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q -DskipTests package \
    && cp target/employee-app-*.jar /app.jar

# ---- Run: only the Java runtime, as a non-root user ----
FROM eclipse-temurin:25-jre
# curl is used only by the health check below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /app.jar /app/app.jar
USER app
EXPOSE 8080
# Heap follows the container memory limit; stop (and be restarted) on out-of-memory.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
