#!/usr/bin/env bash
# =====================================================================
#  MAKLAYN (Java / Spring Boot) — compila e executa em JDK 11+
#
#  Uso:   bash run.sh                 -> perfil "dev" (H2 em memória)
#         bash run.sh mysql           -> perfil padrão (MySQL)
#         bash run.sh test            -> só roda os testes
#
#  Requisitos: JDK 11 ou superior + Maven 3.6+
#  Se o Maven falhar ao baixar dependências (erro "transfer failed"),
#  ele define automaticamente MAVEN_OPTS com TLS 1.2, que resolve o
#  problema conhecido do java.net.http.HttpClient do JDK 11 com alguns CDNs.
# =====================================================================
set -e
cd "$(dirname "$0")"

if [ -z "$JAVA_HOME" ]; then
  for candidato in /usr/lib/jvm/jdk-11 /usr/lib/jvm/java-11-openjdk-amd64; do
    if [ -x "$candidato/bin/javac" ]; then export JAVA_HOME="$candidato"; break; fi
  done
fi
export MAVEN_OPTS="${MAVEN_OPTS:-} -Djdk.tls.client.protocols=TLSv1.2"

echo "▸ Maklayn (Java) — JAVA_HOME=${JAVA_HOME:-'(padrão do sistema)'}"
javac -version 2>&1 | sed 's/^/  /'

case "${1:-dev}" in
  test)
    echo "▸ Rodando os testes..."
    mvn -B test
    ;;
  mysql)
    echo "▸ Subindo com MySQL (veja application.yml para host/usuário/senha)..."
    mvn -B -q package -DskipTests
    java -jar target/maklayn-java-1.0.0.jar
    ;;
  *)
    echo "▸ Subindo com H2 em memória (perfil dev) — ideal para avaliação rápida."
    echo "  API:        http://localhost:8080/api/health"
    echo "  Console H2: http://localhost:8080/h2-console"
    mvn -B -q package -DskipTests
    java -jar target/maklayn-java-1.0.0.jar --spring.profiles.active=dev
    ;;
esac
