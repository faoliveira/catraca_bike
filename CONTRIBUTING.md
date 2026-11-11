# Como contribuir com o catálogo

Toda alteração passa por Pull Request. Não há formulário de envio nem coleta automática: uma pessoa confere as informações e as fontes de cada modelo antes do merge.

## Passo a passo

1. Crie um fork do repositório e uma branch a partir de `main`.
2. Adicione ou edite `models/<pasta-da-marca>/<slug>.json` (veja [Nomes e pastas](#nomes-e-pastas)).
3. Preencha os campos seguindo [Campos de um modelo](#campos-de-um-modelo). Dado desconhecido é `null`; não estime nem copie de outra versão do modelo.
4. Rode `bun install` uma vez e depois `bun run validar`. Corrija o que ele apontar: a mensagem diz o arquivo, o campo e o que mudar.
5. Abra o Pull Request para `main` com o nome do modelo e os links usados na descrição.
6. Espere o CI verde e a revisão humana. Depois do merge, o site busca o catálogo novo sozinho e passa a mostrar o modelo assim que o build dele passa.

Pela interface do GitHub, os passos 1 a 3 cabem em **Add file → Create new file** no seu fork; a validação roda no Pull Request do mesmo jeito.

## Nomes e pastas

- **Pasta da marca:** o nome comercial sem acento, espaço nem hífen, em minúsculas (`Two Dogs` → `twodogs`, `Caloi` → `caloi`).
- **Slug:** letras minúsculas, números e hífens (`strada-my20`). O arquivo se chama `<slug>.json`.
- **Id do modelo:** `<pasta-da-marca>/<slug>`, como `caloi/strada-my20`. É o id usado em `comparisons.json` e no endereço do site.
- **Foto:** `imagem.arquivo` é sempre `<pasta-da-marca>/<slug>.webp`, o mesmo nome do modelo.

## Campos de um modelo

O contrato completo está em [`schemas/bike.schema.json`](schemas/bike.schema.json). Campos fora do schema são recusados.

| Campo | Obrigatório | O que vai |
| --- | --- | --- |
| `marca`, `modelo` | sim | Texto, como aparece no fabricante |
| `ano` | sim | Ano-modelo de 2000 a 2100, ou `null` |
| `slug` | sim | Igual ao nome do arquivo |
| `categoria` | sim | `mtb`, `urbana`, `speed`, `gravel`, `ebike` ou `infantil` |
| `url_fabricante` | sim | Página do modelo no fabricante, ou `null` |
| `preco_sugerido_brl` | sim | Preço público sugerido pelo fabricante, em reais, ou `null` |
| `atualizado_em` | sim | Data da última verificação, `AAAA-MM-DD`, não futura |
| `quadro` | sim | `material`, `tamanhos`, `aro`, `suspensao`, `curso_mm` (cada um pode ser `null`) |
| `componentes` | sim | `grupo`, `velocidades`, `tipo_freio`, `peso_kg` (cada um pode ser `null`) |
| `ebike` | sim | `null` em bike sem motor; o bloco completo em `categoria: "ebike"` |
| `fontes` | sim | Ao menos uma: `url`, `tipo` (`fabricante`, `loja` ou `review`) e `acessado_em` |
| `imagem` | não | `arquivo` e `fonte_url`, preenchidos pelo mantenedor quando a foto é publicada (veja [Foto do modelo](#foto-do-modelo)) |
| `links_compra` | não | Lista de `{ "url": ... }` (veja [Link de compra](#link-de-compra)) |

### Exemplo completo

Os exemplos abaixo também estão em [`tests/fixtures/valido/`](tests/fixtures/valido/), e o teste do validador confere que eles passam. `fabricante.example` e `loja.example` são domínios reservados para documentação: use as URLs reais do modelo.

```json
{
  "marca": "Exemplo",
  "modelo": "Trilha 29",
  "ano": 2026,
  "slug": "exemplo-trilha-29",
  "categoria": "mtb",
  "url_fabricante": "https://fabricante.example/bikes/trilha-29",
  "preco_sugerido_brl": 4990,
  "atualizado_em": "2026-11-09",
  "quadro": {
    "material": "Alumínio",
    "tamanhos": ["P", "M", "G"],
    "aro": "29",
    "suspensao": "hardtail",
    "curso_mm": 100
  },
  "componentes": {
    "grupo": "Shimano Cues 1x10",
    "velocidades": 10,
    "tipo_freio": "Disco hidráulico",
    "peso_kg": null
  },
  "ebike": null,
  "fontes": [
    {
      "url": "https://fabricante.example/bikes/trilha-29",
      "tipo": "fabricante",
      "acessado_em": "2026-11-09"
    }
  ],
  "imagem": {
    "arquivo": "exemplo/exemplo-trilha-29.webp",
    "fonte_url": "https://fabricante.example/bikes/trilha-29"
  },
  "links_compra": [
    { "url": "https://loja.example/produto/trilha-29" }
  ]
}
```

Numa e-bike, `categoria` é `"ebike"` e o bloco `ebike` traz todos os campos abaixo, com `null` nos desconhecidos, inclusive nos booleanos:

```json
"ebike": {
  "motor_tipo": "Cubo traseiro",
  "potencia_w": 350,
  "torque_nm": null,
  "bateria_wh": 748.8,
  "autonomia_declarada_km": 60,
  "acelerador": false,
  "assistencia_so_com_pedal": true,
  "vel_max_kmh": 25,
  "largura_cm": null,
  "entre_eixos_cm": null
}
```

- `potencia_w` é a potência nominal do motor, a que a Resolução Contran 996/2023 limita. Se a página da bike nomeia o motor, mas só dá a potência de pico (como os 600 W do Shimano EP8) ou não dá potência nenhuma, use a nominal que o fabricante do motor publica, com a página dele em `fontes`. Se ele não publicar, use `null`.
- `assistencia_so_com_pedal` só é `true` quando uma fonte diz que o motor assiste exclusivamente durante a pedalada. A falta de acelerador na página da bike não prova isso.
- A documentação oficial do fabricante do motor também serve de fonte para `acelerador` e `assistencia_so_com_pedal` quando diz que o sistema só assiste enquanto se pedala. Nesse caso, a bike recebe `acelerador: false` e `assistencia_so_com_pedal: true`, com essa página em `fontes` e `tipo` `"fabricante"`, a menos que a página da bike mostre um acelerador. O modo de assistência a pé, que move a bike até 6 km/h sem pedalar, não muda a resposta, porque o § 4º do art. 2º da resolução o permite na bicicleta elétrica. Sem essa documentação, vale o que a página da bike disser.
- `vel_max_kmh` é a velocidade máxima com motor declarada pelo fabricante: a maior entre acelerador e assistência, a velocidade máxima de fabricação da Resolução Contran 996/2023. Numa bike com acelerador, se a fonte só informar até onde vai a assistência, use `null`.

## Regras editoriais

- PT-BR nos textos e BRL nos preços.
- `preco_sugerido_brl` é o preço público sugerido pelo fabricante, não promoção de loja.
- `autonomia_declarada_km` guarda só o valor declarado, nunca uma medição.
- Não use `0`, texto vazio ou lista vazia para dado desconhecido: use `null`.
- `ebike.bateria_wh` pode ser calculado quando a fonte dá tensão e carga (48 V × 15,6 Ah = 748,8 Wh). Nenhum outro valor é calculado ou estimado.
- O catálogo aceita só bicicletas completas: quadro avulso, scooter e triciclo ficam de fora.
- `categoria` é `infantil` para bikes sem motor de aro até 20 ou balance, exceto as dobráveis. E-bike continua `ebike`, mesmo com aro pequeno.
- `quadro.aro` vai em polegadas (`"29"`, `"27.5"`, `"27.5/29"` quando muda com o tamanho) ou `"700c"`.
- A classe Contran, o preço por Wh e o aviso de preço antigo são calculados pelo site. Não entram no JSON.

## Foto do modelo

Cada modelo pode ter uma foto lateral. Sem ela, o site mostra a silhueta da categoria.

As fotos não entram neste repositório: os direitos são dos fabricantes e das lojas, e o mantenedor guarda os arquivos e os publica no site com crédito. Por isso, não envie imagem no Pull Request. Para sugerir uma foto, cite na descrição do PR (ou numa issue) a página do fabricante ou de uma loja que já esteja nas `fontes` do modelo. Prefira a vista lateral, com a bike inteira e fundo liso, sem foto de ambiente, vista em 3/4 ou selo por cima.

Quando a foto é publicada, o mantenedor acrescenta ao JSON o caminho dela e a página de onde ela veio, que vira o crédito "Foto: <marca>" no site:

```json
"imagem": {
  "arquivo": "caloi/strada-my20.webp",
  "fonte_url": "https://fabricante.example/modelo"
}
```

A validação confere o formato do caminho, que precisa repetir a pasta da marca e o slug do modelo, e se a `fonte_url` é uma URL limpa.

## Link de compra

`links_compra` lista páginas de loja que vendem o modelo. A URL vai limpa: a página do produto como aparece no navegador, sem rastreio nem afiliado.

```json
"links_compra": [
  { "url": "https://www.amazon.com.br/dp/B0EXEMPLO1" }
]
```

A validação recusa:

- parâmetros `utm_*`, `tag`, `ref`, `matt_*` e `partner_id`;
- links encurtados (`amzn.to`, `a.co`, `shope.ee`, `s.shopee.com.br`, `mercadolivre.com/sec/...`);
- URLs de `magazinevoce.com.br`; use o mesmo produto em `magazineluiza.com.br`.

Parâmetros que identificam o produto, como cor, variante ou `seller_id`, podem ficar. A regra vale também para `url_fabricante`, `fontes`, `imagem.fonte_url` e os links das dicas.

**Por que a URL vai limpa:** um link copiado de loja costuma trazer o afiliado de quem compartilhou, e a comissão iria para outra pessoa sem ninguém perceber. O site do Catraca acrescenta os próprios parâmetros só na hora de montar o link, sempre com o rótulo "link de afiliado", e quem prefere pode ligar o "link limpo" na ficha. A explicação para quem visita está na página [Políticas](https://catraca.bike/politicas/).

## Dica de acessório

Uma dica por arquivo, em `acessorios/<slug>.json`, no formato de [`schemas/dica.schema.json`](schemas/dica.schema.json). A `categoria` é `capacete`, `luz`, `cadeado`, `bomba`, `ferramenta`, `bolsa` (inclui alforje e mochila de bike), `computador` (computador de bordo, GPS e sensores) ou `outro`. Os links seguem a regra de URL limpa; sem link, use `null`.

```json
{
  "titulo": "Luz traseira recarregável",
  "slug": "exemplo-luz-traseira",
  "categoria": "luz",
  "resumo": "Deixa a bike visível de trás à noite e com chuva. Prefira as que piscam e carregam por USB.",
  "links": [
    { "url": "https://loja.example/produto/luz-traseira", "rotulo": "Loja Exemplo" }
  ],
  "atualizado_em": "2026-11-09"
}
```

## Comparações prontas

`comparisons.json` lista pares de modelos que ganham uma página própria no site (`/comparar/<a>-vs-<b>/`). Qualquer par já pode ser comparado no site; a lista existe para não gerar uma página para cada combinação.

```json
[
  { "a": "caloi/explorer-sport-2026", "b": "oggi/hacker-sport" }
]
```

A validação recusa id que não existe em `models/`, par repetido (em qualquer ordem) e par de um modelo com ele mesmo.

## Mudar o contrato

Os arquivos de `schemas/` são gerados a partir do contrato que o site usa, para os dois nunca divergirem. Para propor um campo novo ou uma regra diferente, abra uma issue explicando o caso; a mudança chega aqui como um Pull Request que atualiza os schemas e os dados juntos.
