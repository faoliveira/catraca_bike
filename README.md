# Catraca · catálogo de bikes

Este repositório guarda os dados do [Catraca](https://catraca.bike), o site que compara bicicletas e bicicletas elétricas vendidas no Brasil com preço em reais e a fonte de cada número. Cada modelo é um arquivo JSON que qualquer pessoa pode corrigir ou ampliar por Pull Request; antes da revisão humana, a validação aponta o arquivo e o campo que precisam mudar. Quando o fabricante não informa um dado, ele fica como `null`, e nada é estimado.

- **Um arquivo por modelo**, de marcas nacionais e importadas, sempre com ao menos uma fonte e a data em que ela foi consultada.
- **Validação com mensagens em português**, que roda no seu computador com `bun run validar` e de novo em todo Pull Request.
- **Contrato em JSON Schema**, gerado a partir do contrato que o site usa, para os dois nunca divergirem.
- **Revisão humana** em toda mudança. Não há formulário de envio nem coleta automática de dados.
- **Dados abertos sob [CC BY 4.0](LICENSE)**: dá para reutilizar, inclusive comercialmente, desde que o Catraca seja creditado.

```console
$ bun run validar   # depois de trocar o peso de uma bike por 0
models/caloi/strada-my20.json → componentes.peso_kg: use um número maior que zero; se o dado for desconhecido, use null

1 problema(s) em 1 arquivo(s).
```

---

## Corrigir ou incluir uma bike

Você precisa do [Bun](https://bun.sh) 1.4.4 e de um fork deste repositório na sua conta do GitHub.

1. Clone o fork e crie uma branch para a mudança:

   ```bash
   git clone https://github.com/<seu-usuario>/catraca_bike.git
   cd catraca_bike
   git switch -c corrige-caloi-strada
   bun install
   ```

2. Edite o modelo em `models/<pasta-da-marca>/<slug>.json` ou crie um arquivo novo. Os exemplos completos de `tests/fixtures/valido/` servem de ponto de partida, e o [CONTRIBUTING.md](CONTRIBUTING.md) explica cada campo.
3. Rode a validação até ela não apontar mais nada:

   ```bash
   bun run validar
   ```

4. Faça o commit, envie a branch e abra o Pull Request para `main`, com os links das fontes na descrição:

   ```bash
   git add models/
   git commit -m "fix(data): corrige o peso da Caloi Strada"
   git push -u origin corrige-caloi-strada
   ```

Também dá para contribuir sem instalar nada: no seu fork, use **Add file → Create new file** na interface do GitHub. A validação roda no Pull Request do mesmo jeito.

Para apontar um dado errado sem editar arquivo, abra o [formulário de correção](../../issues/new?template=correcao.yml) com o link da ficha.

## O que tem aqui

```text
models/<pasta-da-marca>/<slug>.json   um arquivo por modelo
acessorios/<slug>.json                dicas de capacete, luz, cadeado, bomba e ferramenta
comparisons.json                      pares de modelos que ganham uma página de comparação no site
schemas/                              bike.schema.json e dica.schema.json
scripts/validar.ts                    a validação (bun run validar)
tests/                                testes do validador e exemplos completos em tests/fixtures/valido/
```

O nome da pasta é a marca sem acento, espaço nem hífen (`Two Dogs` vira `twodogs`), e o nome do arquivo repete o `slug` do modelo. O endereço da ficha no site segue o mesmo caminho: `catraca.bike/caloi/strada-my20/`.

```bash
bun run validar   # JSON, schema, slug, pasta da marca, datas e comparações
bun test          # testa o próprio validador
```

O site lê este repositório num commit fixado. Quando um merge muda dados, o site é avisado, troca para o commit novo e publica em [catraca.bike](https://catraca.bike), desde que os testes e o build dele passem.

## Licença

Os dados deste repositório (`models/`, `acessorios/`, `comparisons.json` e `schemas/`) estão sob a [Creative Commons Atribuição 4.0 Internacional](LICENSE). Ao reutilizar, credite assim: "Dados do Catraca (catraca.bike), CC BY 4.0". Quem contribui concorda em publicar a contribuição sob a mesma licença.

As fotos dos modelos não fazem parte deste repositório nem desta licença. Elas pertencem aos fabricantes e às lojas indicados em `imagem.fonte_url` de cada modelo; o Catraca as exibe com crédito e link para a origem. Para pedir que uma foto seja removida, abra uma issue com o link da ficha.
