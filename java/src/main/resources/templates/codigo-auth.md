## 💻 Autenticação segura: hash de senha e token de sessão

> **Pedido:** {{prompt}}

**Linguagem:** `java` · **Padrões:** Strategy (algoritmo de hash) + Filter (autenticação)

### Implementação

```java
/** Deriva a senha com salt aleatório; formato autodescritivo. */
public static String hashSenha(char[] senha) throws GeneralSecurityException {
    byte[] salt = new byte[16];
    new SecureRandom().nextBytes(salt);

    var spec = new PBEKeySpec(senha, salt, 210_000, 256); // PBKDF2-HMAC-SHA256
    byte[] chave = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                                   .generateSecret(spec)
                                   .getEncoded();

    return "pbkdf2$210000$"
         + Base64.getEncoder().encodeToString(salt) + "$"
         + Base64.getEncoder().encodeToString(chave);
}

/** Compara em tempo constante — evita vazar informação por timing. */
public static boolean verificar(char[] senha, String armazenado) throws GeneralSecurityException {
    String[] partes = armazenado.split("\\$");
    int iteracoes = Integer.parseInt(partes[1]);
    byte[] salt = Base64.getDecoder().decode(partes[2]);
    byte[] esperado = Base64.getDecoder().decode(partes[3]);

    var spec = new PBEKeySpec(senha, salt, iteracoes, esperado.length * 8);
    byte[] calculado = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                                       .generateSecret(spec)
                                       .getEncoded();
    return MessageDigest.isEqual(esperado, calculado);
}
```

### Como funciona

1. **Nunca armazene a senha.** O PBKDF2 deriva uma chave de 256 bits aplicando HMAC 210.000 vezes: o custo é desprezível para um login e proibitivo para um ataque de força bruta em massa.
2. O `salt` aleatório por usuário impede *rainbow tables* — duas pessoas com a mesma senha geram hashes diferentes.
3. O formato `algoritmo$iterações$salt$hash` é autodescritivo: ao aumentar as iterações no futuro, os hashes antigos continuam verificáveis.
4. `MessageDigest.isEqual` compara em tempo constante; um `Arrays.equals` comum para no primeiro byte divergente e vaza quantos bytes o atacante acertou.

### Complexidade e trade-offs

| Escolha | Ganho | Custo / alternativa |
| --- | --- | --- |
| PBKDF2 (nativo) | Sem dependência externa | Argon2id resiste melhor a GPU |
| Token JWT | Não consulta o banco a cada requisição | Não é revogável antes de expirar |
| Cookie httpOnly | Imune a XSS | Exige proteção CSRF (`SameSite=Strict`) |

### Testes sugeridos

- [ ] Hashes da mesma senha diferem, mas ambos verificam (`salt` aleatório).
- [ ] Senha errada retorna `false` sem lançar exceção.
- [ ] Token com payload adulterado é rejeitado na validação da assinatura.
- [ ] Medir o tempo de resposta: deve ser estável mesmo para e-mails inexistentes.
