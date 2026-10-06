-- =====================================================================
--  MAKLAYN — Esquema SQLite (espelho fiel do schema MySQL)
--  Usado automaticamente em desenvolvimento quando DB_CLIENT=sqlite.
--  Permite rodar o projeto sem instalar servidor de banco.
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Tabela: Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Usuarios (
  id_usuario    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_completo TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  google_id     TEXT UNIQUE,
  foto_url      TEXT,
  papel         TEXT NOT NULL DEFAULT 'aluno'
                CHECK (papel IN ('aluno','dev','professor','admin')),
  ativo         INTEGER NOT NULL DEFAULT 1,
  data_criacao  TEXT NOT NULL DEFAULT (datetime('now')),
  data_acesso   TEXT
);

-- ---------------------------------------------------------------------
-- Tabela: Historico_Consultas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Historico_Consultas (
  id_consulta    INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario     INTEGER NOT NULL,
  tipo_consulta  TEXT NOT NULL CHECK (tipo_consulta IN ('Codigo','Redacao','Pesquisa')),
  prompt_usuario TEXT NOT NULL,
  resposta_ia    TEXT NOT NULL,
  modelo_usado   TEXT,
  tokens_usados  INTEGER,
  latencia_ms    INTEGER,
  data_hora      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_usuario) REFERENCES Usuarios (id_usuario) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hist_usuario_data ON Historico_Consultas (id_usuario, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_hist_tipo         ON Historico_Consultas (tipo_consulta);

-- ---------------------------------------------------------------------
-- Tabela: Referencias_Salvas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Referencias_Salvas (
  id_referencia  INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario     INTEGER NOT NULL,
  id_consulta    INTEGER,
  titulo_link    TEXT NOT NULL,
  url_referencia TEXT NOT NULL,
  anotacao       TEXT,
  data_salvo     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (id_usuario)  REFERENCES Usuarios (id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_consulta) REFERENCES Historico_Consultas (id_consulta) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_usuario_url ON Referencias_Salvas (id_usuario, url_referencia);
CREATE INDEX        IF NOT EXISTS idx_ref_usuario     ON Referencias_Salvas (id_usuario, data_salvo DESC);

-- ---------------------------------------------------------------------
-- View auxiliar: estatísticas por usuário
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS vw_estatisticas_usuario;
CREATE VIEW vw_estatisticas_usuario AS
SELECT
  u.id_usuario,
  u.nome_completo,
  u.email,
  COUNT(DISTINCT h.id_consulta)  AS total_consultas,
  SUM(CASE WHEN h.tipo_consulta = 'Codigo'   THEN 1 ELSE 0 END) AS total_codigo,
  SUM(CASE WHEN h.tipo_consulta = 'Redacao'  THEN 1 ELSE 0 END) AS total_redacao,
  SUM(CASE WHEN h.tipo_consulta = 'Pesquisa' THEN 1 ELSE 0 END) AS total_pesquisa,
  COUNT(DISTINCT r.id_referencia) AS total_referencias,
  MAX(h.data_hora) AS ultima_consulta
FROM Usuarios u
LEFT JOIN Historico_Consultas h ON h.id_usuario = u.id_usuario
LEFT JOIN Referencias_Salvas  r ON r.id_usuario = u.id_usuario
GROUP BY u.id_usuario, u.nome_completo, u.email;
