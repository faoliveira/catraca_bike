// Valida o catálogo público do Catraca: sintaxe JSON, schema, identificadores e referências entre arquivos.
// As fotos não ficam aqui: os direitos são dos fabricantes e das lojas, e o mantenedor as guarda e publica à parte.
// Uso: bun run validar [pasta]   (padrão: a raiz deste repositório)
// No GitHub Actions, cada problema também vira uma anotação no arquivo do Pull Request.
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

export interface Problema {
  /** Caminho a partir da raiz do catálogo, como models/caloi/strada-my20.json. */
  arquivo: string;
  campo: string;
  mensagem: string;
}

const RAIZ_PADRAO = fileURLToPath(new URL("..", import.meta.url));

export const hojeUtc = () => new Date().toISOString().slice(0, 10);

/** Pasta esperada para uma marca: sem acento, minúscula, só letras e números ("Two Dogs" vira "twodogs"). */
export function pastaDaMarca(marca: string): string {
  return marca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Mensagens dos padrões do schema, as mesmas do contrato do site. O teste de mensagens falha se um padrão novo
 * aparecer no schema sem mensagem aqui.
 */
const MENSAGENS_DE_PADRAO: Array<[(padrao: string) => boolean, string]> = [
  [(p) => p === "^[a-z0-9]+(?:-[a-z0-9]+)*$", "use só letras minúsculas, números e hífens (ex.: strada-my20)"],
  [(p) => p === "^https?:\\/\\/", "use uma URL completa, começando com https://"],
  [(p) => p.includes("utm_"), "tire os parâmetros de rastreio ou de afiliado (utm_*, tag, ref, matt_*, partner_id); o Catraca põe os dele na saída"],
  [(p) => p.includes("amzn"), "link encurtado: abra o link no navegador e use a URL completa do produto"],
  [(p) => p.includes("magazinevoce"), "use a URL do mesmo produto em magazineluiza.com.br, não a do Magazine Você"],
  [(p) => p.includes("-02-29"), "use uma data no formato AAAA-MM-DD"],
  [(p) => p.includes("700c"), "use o aro em polegadas (29, 27.5, 27.5/29) ou 700c, sem aspas"],
  [(p) => p.includes("\\.webp"), "use o caminho da foto no formato <pasta-da-marca>/<slug>.webp"],
];

export function mensagemDoPadrao(padrao: string): string | null {
  return MENSAGENS_DE_PADRAO.find(([casa]) => casa(padrao))?.[1] ?? null;
}

const LISTA_VAZIA: Record<string, string> = {
  fontes: "inclua ao menos uma fonte",
  tamanhos: "lista vazia: use null quando os tamanhos forem desconhecidos",
  links_compra: "lista vazia: tire o campo quando não houver link de compra",
  links: "lista vazia: use null quando a dica não tiver link",
};
const TIPOS: Record<string, string> = {
  string: "texto",
  number: "número",
  integer: "número inteiro",
  boolean: "true ou false",
  object: "objeto",
  array: "lista",
  null: "null",
};

const campoDe = (erro: ErrorObject) =>
  erro.instancePath.replace(/^\//, "").replaceAll("/", ".") || "(raiz)";

/**
 * Traduz os erros do Ajv para o vocabulário do Catraca e fica com um erro por campo: o mais específico.
 * Num campo que aceita valor ou null, o Ajv reclama dos dois ramos; o erro do ramo que não é null é o que importa.
 */
export function traduzirErros(erros: ErrorObject[], dados: unknown): Array<{ campo: string; mensagem: string }> {
  const porCampo = new Map<string, ErrorObject[]>();
  for (const erro of erros) {
    if (erro.keyword === "anyOf" || erro.keyword === "allOf") continue;
    const chave = erro.keyword === "required" || erro.keyword === "additionalProperties" ? `${erro.instancePath}#${JSON.stringify(erro.params)}` : erro.instancePath;
    porCampo.set(chave, [...(porCampo.get(chave) ?? []), erro]);
  }
  const saida: Array<{ campo: string; mensagem: string }> = [];
  for (const grupo of porCampo.values()) {
    const aceitaNull = grupo.some((e) => e.keyword === "type" && e.params.type === "null");
    const relevantes = grupo.filter((e) => !(e.keyword === "type" && e.params.type === "null"));
    const especifico = relevantes.find((e) => e.keyword !== "type") ?? relevantes[0] ?? grupo[0];
    if (!especifico) continue;
    const nome = especifico.instancePath.split("/").pop() ?? "";
    const campo = campoDe(especifico);
    switch (especifico.keyword) {
      case "required":
        saida.push({
          campo: campo === "(raiz)" ? String(especifico.params.missingProperty) : `${campo}.${especifico.params.missingProperty}`,
          mensagem: "campo obrigatório ausente; se o dado for desconhecido, use null",
        });
        break;
      case "additionalProperties":
        saida.push({
          campo: campo === "(raiz)" ? String(especifico.params.additionalProperty) : `${campo}.${especifico.params.additionalProperty}`,
          mensagem: "campo não existe no schema; remova ou corrija o nome",
        });
        break;
      case "pattern":
        saida.push({ campo, mensagem: mensagemDoPadrao(String(especifico.params.pattern)) ?? `valor fora do formato esperado (${especifico.params.pattern})` });
        break;
      case "format":
        saida.push({ campo, mensagem: especifico.params.format === "date" ? "use uma data no formato AAAA-MM-DD" : `formato inválido (${especifico.params.format})` });
        break;
      case "enum":
        saida.push({ campo, mensagem: `use um destes valores: ${(especifico.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}` });
        break;
      case "minimum":
      case "maximum":
        saida.push({ campo, mensagem: nome === "ano" ? "use o ano-modelo com quatro dígitos, de 2000 a 2100" : `use um valor ${especifico.keyword === "minimum" ? "a partir de" : "até"} ${especifico.params.limit}` });
        break;
      case "exclusiveMinimum":
        saida.push({ campo, mensagem: "use um número maior que zero; se o dado for desconhecido, use null" });
        break;
      case "minItems":
        saida.push({ campo, mensagem: LISTA_VAZIA[nome] ?? "lista vazia" });
        break;
      case "minLength":
        saida.push({ campo, mensagem: "use texto não vazio; se o dado for desconhecido, use null" });
        break;
      case "type": {
        const esperado = TIPOS[String(especifico.params.type)] ?? String(especifico.params.type);
        const valor = especifico.instancePath.split("/").slice(1).reduce<unknown>((atual, chave) => (atual as Record<string, unknown> | null)?.[chave], dados);
        const dica = valor === 0 || valor === "" || (Array.isArray(valor) && valor.length === 0) ? "; desconhecido é null, não 0 nem vazio" : "";
        saida.push({ campo, mensagem: `use ${esperado}${aceitaNull ? " ou null" : ""}${dica}` });
        break;
      }
      default:
        saida.push({ campo, mensagem: especifico.message ?? "valor inválido" });
    }
  }
  return saida;
}

async function listar(pasta: string): Promise<string[]> {
  try {
    return (await readdir(pasta, { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile() && d.name !== ".DS_Store")
      .map((d) => join(d.parentPath, d.name).slice(pasta.length).replace(/^[\\/]/, "").split(sep).join("/"))
      .sort();
  } catch {
    return [];
  }
}

async function lerJson(caminho: string): Promise<{ dados: unknown } | { erro: string }> {
  try {
    return { dados: JSON.parse(await readFile(caminho, "utf8")) };
  } catch (e) {
    return { erro: `JSON inválido: ${(e as Error).message}` };
  }
}

async function compilar(pastaSchemas: string, arquivo: string): Promise<ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv, { formats: ["date", "uri"] });
  return ajv.compile(JSON.parse(await readFile(join(pastaSchemas, arquivo), "utf8")) as object);
}

interface Bike {
  marca: string;
  slug: string;
  categoria: string;
  ebike: unknown;
  atualizado_em: string;
  fontes: Array<{ acessado_em: string }>;
  imagem?: { arquivo: string };
}
interface Dica {
  slug: string;
  atualizado_em: string;
}

/**
 * Valida um catálogo inteiro. `raiz` é a pasta com models/, acessorios/ e comparisons.json; os schemas vêm
 * sempre de schemas/ deste repositório, para os testes usarem o contrato de verdade.
 */
export async function validarCatalogo(raiz = RAIZ_PADRAO, opcoes: { hoje?: string; schemas?: string } = {}) {
  const { hoje = hojeUtc(), schemas = join(RAIZ_PADRAO, "schemas") } = opcoes;
  const problemas: Problema[] = [];
  const anotar = (arquivo: string, campo: string, mensagem: string) => problemas.push({ arquivo, campo, mensagem });

  const validarBike = await compilar(schemas, "bike.schema.json");
  const validarDica = await compilar(schemas, "dica.schema.json");

  // Modelos: models/<pasta-da-marca>/<slug>.json
  const ids = new Set<string>();
  const modelos = await listar(join(raiz, "models"));
  for (const relativo of modelos) {
    const arquivo = `models/${relativo}`;
    const partes = relativo.split("/");
    if (partes.length !== 2 || !relativo.endsWith(".json")) {
      anotar(arquivo, "(arquivo)", "cada modelo é um JSON em models/<pasta-da-marca>/<slug>.json");
      continue;
    }
    const [pasta, nome] = partes as [string, string];
    // O id é o caminho, como no site. Um modelo quebrado continua registrado, para o erro dele não aparecer de novo
    // como "comparação com modelo inexistente".
    const id = `${pasta}/${nome.slice(0, -".json".length)}`;
    ids.add(id);
    const lido = await lerJson(join(raiz, arquivo));
    if ("erro" in lido) {
      anotar(arquivo, "(arquivo)", lido.erro);
      continue;
    }
    if (!validarBike(lido.dados)) {
      for (const { campo, mensagem } of traduzirErros(validarBike.errors ?? [], lido.dados)) anotar(arquivo, campo, mensagem);
      continue;
    }
    const bike = lido.dados as Bike;
    if (nome !== `${bike.slug}.json`) anotar(arquivo, "slug", `"${bike.slug}" precisa ser igual ao nome do arquivo (${nome})`);
    if (pasta !== pastaDaMarca(bike.marca)) anotar(arquivo, "marca", `a marca "${bike.marca}" deve ficar em models/${pastaDaMarca(bike.marca)}/`);
    if ((bike.categoria === "ebike") !== (bike.ebike !== null)) {
      if (bike.ebike === null) anotar(arquivo, "ebike", 'categoria "ebike" exige o bloco ebike; use null só nos valores desconhecidos dentro dele');
      else anotar(arquivo, "categoria", 'o bloco ebike só vale para categoria "ebike"; ajuste a categoria ou troque o bloco por null');
    }
    if (bike.atualizado_em > hoje) anotar(arquivo, "atualizado_em", `data no futuro (hoje é ${hoje})`);
    bike.fontes.forEach((fonte, i) => {
      if (fonte.acessado_em > hoje) anotar(arquivo, `fontes.${i}.acessado_em`, `data no futuro (hoje é ${hoje})`);
    });
    if (bike.imagem) {
      const esperado = `${pastaDaMarca(bike.marca)}/${bike.slug}.webp`;
      if (bike.imagem.arquivo !== esperado) anotar(arquivo, "imagem.arquivo", `o caminho da foto deste modelo é ${esperado}`);
    }
  }

  // Acessórios: acessorios/<slug>.json, no formato de schemas/dica.schema.json.
  const acessorios = (await listar(join(raiz, "acessorios"))).filter((a) => a !== "README.md");
  let totalAcessorios = 0;
  for (const relativo of acessorios) {
    const arquivo = `acessorios/${relativo}`;
    if (relativo.includes("/") || !relativo.endsWith(".json")) {
      anotar(arquivo, "(arquivo)", "cada dica de acessório é um JSON em acessorios/<slug>.json");
      continue;
    }
    totalAcessorios++;
    const lido = await lerJson(join(raiz, arquivo));
    if ("erro" in lido) {
      anotar(arquivo, "(arquivo)", lido.erro);
      continue;
    }
    if (!validarDica(lido.dados)) {
      for (const { campo, mensagem } of traduzirErros(validarDica.errors ?? [], lido.dados)) anotar(arquivo, campo, mensagem);
      continue;
    }
    const dica = lido.dados as Dica;
    if (relativo !== `${dica.slug}.json`) anotar(arquivo, "slug", `"${dica.slug}" precisa ser igual ao nome do arquivo (${relativo})`);
    if (dica.atualizado_em > hoje) anotar(arquivo, "atualizado_em", `data no futuro (hoje é ${hoje})`);
  }

  // Comparações prontas: pares de ids que existem, sem repetição.
  const lidas = await lerJson(join(raiz, "comparisons.json"));
  if ("erro" in lidas) {
    anotar("comparisons.json", "(arquivo)", lidas.erro);
  } else if (!Array.isArray(lidas.dados)) {
    anotar("comparisons.json", "(raiz)", 'use uma lista de { "a": "<pasta-da-marca>/<slug>", "b": "<pasta-da-marca>/<slug>" }');
  } else {
    const vistos = new Set<string>();
    lidas.dados.forEach((par: unknown, i) => {
      const { a, b, ...resto } = (par ?? {}) as Record<string, unknown>;
      if (typeof a !== "string" || typeof b !== "string" || Object.keys(resto).length > 0) {
        anotar("comparisons.json", String(i), 'cada item é { "a": "<pasta-da-marca>/<slug>", "b": "<pasta-da-marca>/<slug>" }, sem outros campos');
        return;
      }
      for (const [lado, id] of [["a", a], ["b", b]] as const) {
        if (!ids.has(id)) anotar("comparisons.json", `${i}.${lado}`, `o modelo "${id}" não existe em models/`);
      }
      if (a === b) anotar("comparisons.json", String(i), "a e b são o mesmo modelo");
      const chave = [a, b].sort().join("|");
      if (vistos.has(chave)) anotar("comparisons.json", String(i), "par repetido");
      vistos.add(chave);
    });
  }

  return { problemas, totais: { modelos: modelos.length, acessorios: totalAcessorios } };
}

if (import.meta.main) {
  const raiz = process.argv[2] ?? RAIZ_PADRAO;
  const { problemas, totais } = await validarCatalogo(raiz);
  const noGithub = process.env.GITHUB_ACTIONS === "true";
  const escapar = (texto: string) => texto.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const { arquivo, campo, mensagem } of problemas) {
    console.error(`${arquivo} → ${campo}: ${mensagem}`);
    if (noGithub) console.log(`::error file=${arquivo},title=${escapar(campo).replace(/:/g, "%3A").replace(/,/g, "%2C")}::${escapar(mensagem)}`);
  }
  if (problemas.length > 0) {
    console.error(`\n${problemas.length} problema(s) em ${new Set(problemas.map((p) => p.arquivo)).size} arquivo(s).`);
    process.exit(1);
  }
  console.log(`${totais.modelos} modelos e ${totais.acessorios} dicas de acessório válidos.`);
}
