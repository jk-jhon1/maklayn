## 💻 Solução de engenharia para: {{prompt}}

> **Pedido:** {{prompt}}
> **Linguagem sugerida:** `{{linguagem}}`

### 1. Modelagem

| Item | Definição |
| --- | --- |
| **Entrada** | {{prompt}} |
| **Saída esperada** | Resultado determinístico, validado e testável |
| **Padrão de projeto** | `Strategy` para variar a regra + `Repository` para isolar a persistência |

### 2. Esqueleto de código

```java
/**
 * Serviço de domínio — sem dependência de framework de interface.
 * Princípios: responsabilidade única, injeção de dependência e falha explícita.
 */
public class RegraDeNegocio {

    private final Repositorio repositorio; // injetado, não criado aqui

    public RegraDeNegocio(Repositorio repositorio) {
        this.repositorio = Objects.requireNonNull(repositorio);
    }

    /** Ponto único de entrada: valida, executa e devolve resultado. */
    public Resultado executar(Entrada entrada) {
        validar(entrada);
        return processar(entrada);
    }

    private void validar(Entrada entrada) {
        if (entrada == null) {
            throw new IllegalArgumentException("Entrada obrigatória.");
        }
        // TODO: invariantes específicas do domínio
    }

    private Resultado processar(Entrada entrada) {
        return repositorio.salvar(entrada);
    }
}
```

### 3. Como funciona

1. A **validação vem antes do processamento**: erro de entrada é barato, erro descoberto no meio do cálculo é caro de depurar.
2. O construtor **recebe** a dependência em vez de criá-la — em teste você injeta um repositório falso e roda a suíte em milissegundos.
3. Um objeto de resultado imutável evita efeito colateral silencioso, que é a origem mais comum de bug em produção.
4. Exceção é o caminho de erro; o caminho feliz é o retorno normal. Nunca devolver `null` para "algo deu errado".

### 4. Complexidade e trade-offs

| Cenário | Complexidade | Comentário |
| --- | --- | --- |
| Sem cache | O(n) | Uma varredura por chamada |
| Com cache em memória | O(1) amortizado | Exige política de expiração (LRU) |
| Processamento paralelo | O(n/p) | Ganho só se a tarefa for limitada por CPU |

### 5. Testes sugeridos

- [ ] Entrada nula → `IllegalArgumentException` com mensagem clara.
- [ ] Caso feliz com dados reais → resultado esperado.
- [ ] Casos de borda: coleção vazia, string vazia, número negativo.
