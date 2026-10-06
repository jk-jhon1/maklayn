## 💻 SQL: índice composto e otimização de consultas

> **Pedido:** {{prompt}}

**Linguagem:** `sql` · **Padrão:** indexação seletiva + leitura por cobertura

### Implementação

```sql
-- Ordem das colunas importa: igualdade primeiro, ordenação depois.
CREATE INDEX idx_hist_usuario_data
  ON Historico_Consultas (id_usuario, data_hora DESC);

EXPLAIN ANALYZE
SELECT  h.id_consulta,
        h.tipo_consulta,
        LEFT(h.prompt_usuario, 80) AS resumo_prompt,
        h.data_hora
FROM    Historico_Consultas h
WHERE   h.id_usuario = 42
  AND   h.data_hora >= NOW() - INTERVAL 30 DAY
ORDER BY h.data_hora DESC
LIMIT   20;
```

### Como funciona

1. Um índice B-Tree evita o *full table scan*: o banco salta direto para o intervalo procurado (o `EXPLAIN` mostra `Using index`).
2. A regra de ouro do índice composto é **igualdade antes de ordenação**. Com `(id_usuario, data_hora)` o banco filtra o usuário e já entrega as datas ordenadas, sem `filesort`.
3. `LIMIT 20` com índice ordenado ativa a leitura com *early termination*: a varredura para ao atingir a 20ª linha.
4. `LEFT()` no SELECT reduz o tráfego de rede, que costuma ser o maior gargalo — não a CPU.

### Complexidade e trade-offs

| Decisão | Ganho | Custo / alternativa |
| --- | --- | --- |
| Índice composto | Busca O(log n) no lugar de O(n) | Cada escrita atualiza o índice |
| Índice DESC | Evita `filesort` no `ORDER BY DESC` | Não serve para `ASC` |
| Busca textual com LIKE | Implementação imediata | `LIKE '%termo%'` não usa índice: use `FULLTEXT` |

### Testes sugeridos

- [ ] Comparar `EXPLAIN` antes e depois (deve sair de `ALL` para `range`/`ref`).
- [ ] Inserir 1M de linhas e medir o tempo das duas versões.
- [ ] Confirmar `Handler_read_next` reduzido em `SHOW STATUS` (MySQL).
