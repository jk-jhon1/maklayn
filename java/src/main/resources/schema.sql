-- =====================================================================
--  MAKLAYN — Assistente de IA Multidisciplinar
--  Esquema de banco de dados relacional (MySQL 8.x / MariaDB 10.6+)
--  Conforme seção 2 da "Especificação de Sistema Técnico"
-- =====================================================================

CREATE DATABASE IF NOT EXISTS maklayn
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE maklayn;

-- ---------------------------------------------------------------------
-- Tabela: Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Usuarios (
  id_usuario    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Chave Primária',
  nome_completo VARCHAR(150)    NOT NULL                COMMENT 'Nome completo do usuário',
  email         VARCHAR(190)    NOT NULL                COMMENT 'E-mail (único)',
  google_id     VARCHAR(255)    NULL                    COMMENT 'Identificador (sub) da conta Google',
  foto_url      VARCHAR(500)    NULL                    COMMENT 'Avatar fornecido pelo Google',
  papel         ENUM('aluno','dev','professor','admin') NOT NULL DEFAULT 'aluno' COMMENT 'Perfil de uso',
  ativo         TINYINT(1)      NOT NULL DEFAULT 1,
  data_criacao  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_acesso   TIMESTAMP       NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_usuario),
  UNIQUE KEY uq_usuarios_email      (email),
  UNIQUE KEY uq_usuarios_google_id  (google_id),
  KEY idx_usuarios_data_criacao     (data_criacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: Historico_Consultas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Historico_Consultas (
  id_consulta    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Chave Primária',
  id_usuario     BIGINT UNSIGNED NOT NULL                COMMENT 'FK -> Usuarios',
  tipo_consulta  ENUM('Codigo','Redacao','Pesquisa') NOT NULL COMMENT 'Pilar acionado',
  prompt_usuario LONGTEXT        NOT NULL                COMMENT 'Texto da pergunta',
  resposta_ia    LONGTEXT        NOT NULL                COMMENT 'Resposta gerada pela IA',
  modelo_usado   VARCHAR(80)     NULL                    COMMENT 'Ex: maklayn-mock, gemini-2.0-flash, gpt-4o-mini',
  tokens_usados  INT UNSIGNED    NULL,
  latencia_ms    INT UNSIGNED    NULL,
  data_hora      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id_consulta),
  KEY idx_hist_usuario_data (id_usuario, data_hora DESC),
  KEY idx_hist_tipo         (tipo_consulta),
  CONSTRAINT fk_hist_usuario
    FOREIGN KEY (id_usuario) REFERENCES Usuarios (id_usuario)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tabela: Referencias_Salvas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Referencias_Salvas (
  id_referencia  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Chave Primária',
  id_usuario     BIGINT UNSIGNED NOT NULL                COMMENT 'FK -> Usuarios',
  id_consulta    BIGINT UNSIGNED NULL                    COMMENT 'FK opcional -> Historico_Consultas',
  titulo_link    VARCHAR(300)    NOT NULL                COMMENT 'Título da página ou artigo',
  url_referencia VARCHAR(1000)   NOT NULL                COMMENT 'Link sugerido pela IA e salvo pelo usuário',
  anotacao       TEXT            NULL                    COMMENT 'Anotação livre do usuário',
  data_salvo     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id_referencia),
  UNIQUE KEY uq_ref_usuario_url (id_usuario, url_referencia(255)),
  KEY idx_ref_usuario (id_usuario, data_salvo DESC),
  CONSTRAINT fk_ref_usuario
    FOREIGN KEY (id_usuario) REFERENCES Usuarios (id_usuario)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ref_consulta
    FOREIGN KEY (id_consulta) REFERENCES Historico_Consultas (id_consulta)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- View auxiliar: estatísticas por usuário (dashboard do Maklayn)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_estatisticas_usuario AS
SELECT
  u.id_usuario,
  u.nome_completo,
  u.email,
  COUNT(DISTINCT h.id_consulta)  AS total_consultas,
  SUM(h.tipo_consulta = 'Codigo')   AS total_codigo,
  SUM(h.tipo_consulta = 'Redacao')  AS total_redacao,
  SUM(h.tipo_consulta = 'Pesquisa') AS total_pesquisa,
  COUNT(DISTINCT r.id_referencia) AS total_referencias,
  MAX(h.data_hora) AS ultima_consulta
FROM Usuarios u
LEFT JOIN Historico_Consultas  h ON h.id_usuario = u.id_usuario
LEFT JOIN Referencias_Salvas   r ON r.id_usuario = u.id_usuario
GROUP BY u.id_usuario, u.nome_completo, u.email;
