-- =====================================================================
--  MAKLAYN — Esquema H2 (perfil "dev", sem MySQL instalado)
--  Mesmas tabelas e colunas do esquema MySQL (db/schema.mysql.sql).
--  Usar com:  mvn spring-boot:run -Dspring-boot.run.profiles=dev
-- =====================================================================

CREATE TABLE IF NOT EXISTS Usuarios (
  id_usuario    BIGINT AUTO_INCREMENT PRIMARY KEY,
  nome_completo VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  google_id     VARCHAR(255) UNIQUE,
  foto_url      VARCHAR(500),
  papel         VARCHAR(20)  NOT NULL DEFAULT 'aluno',
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  data_criacao  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_acesso   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Historico_Consultas (
  id_consulta    BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_usuario     BIGINT      NOT NULL,
  tipo_consulta  VARCHAR(12) NOT NULL,
  prompt_usuario CLOB        NOT NULL,
  resposta_ia    CLOB        NOT NULL,
  modelo_usado   VARCHAR(80),
  tokens_usados  INT,
  latencia_ms    INT,
  data_hora      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_usuario FOREIGN KEY (id_usuario) REFERENCES Usuarios (id_usuario) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hist_usuario_data ON Historico_Consultas (id_usuario, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_hist_tipo         ON Historico_Consultas (tipo_consulta);

CREATE TABLE IF NOT EXISTS Referencias_Salvas (
  id_referencia  BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_usuario     BIGINT        NOT NULL,
  id_consulta    BIGINT,
  titulo_link    VARCHAR(300)  NOT NULL,
  url_referencia VARCHAR(1000) NOT NULL,
  anotacao       CLOB,
  data_salvo     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ref_usuario  FOREIGN KEY (id_usuario)  REFERENCES Usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_ref_consulta FOREIGN KEY (id_consulta) REFERENCES Historico_Consultas (id_consulta) ON DELETE SET NULL,
  CONSTRAINT uq_ref_usuario_url UNIQUE (id_usuario, url_referencia)
);
