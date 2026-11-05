# syntax=docker/dockerfile:1

FROM maven:3.10.0-eclipse-temurin-17 AS build

WORKDIR /workspace

# Dependency cache layer: pom and wrapper rarely change.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw \
    && ./mvnw -B -DskipTests dependency:go-offline

COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw -B -DskipTests package

FROM eclipse-temurin:17-jre AS runtime

# curl is used only by the Compose healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app --no-create-home app

WORKDIR /app

COPY --from=build --chown=app:app /workspace/target/backend-*.jar /app/backend.jar

USER app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/backend.jar"]
