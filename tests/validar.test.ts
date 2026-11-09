import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mensagemDoPadrao, pastaDaMarca, validarCatalogo } from "../scripts/validar";

const VALIDO = fileURLToPath(new URL("./fixtures/valido", import.meta.url));
const SCHEMAS = fileURLToPath(new URL("../schemas", import.meta.url));
const HOJE = "2026-11-09";
const BIKE = "models/exemplo/exemplo-trilha-29.json";

/** Copia o catálogo válido para uma pasta temporária, aplica a mudança e devolve os problemas encontrados. */
async function problemasCom(mudar: (pasta: string) => Promise<void>) {
  const pasta = await mkdtemp(join(tmpdir(), "catraca-"));
  try {
    await cp(VALIDO, pasta, { recursive: true });
    await mudar(pasta);
    return (await validarCatalogo(pasta, { hoje: HOJE })).problemas;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

async function editarJson(pasta: string, arquivo: string, editar: (dados: Record<string, unknown>) => void) {
  const dados = JSON.parse(await readFile(join(pasta, arquivo), "utf8")) as Record<string, unknown>;
  editar(dados);
  await writeFile(join(pasta, arquivo), JSON.stringify(dados, null, 2));
}

describe("catálogo", () => {
  test("o catálogo deste repositório é válido", async () => {
    const { problemas, totais } = await validarCatalogo();
    expect(totais.modelos).toBeGreaterThan(0);
    expect(problemas.map((p) => `${p.arquivo} → ${p.campo}: ${p.mensagem}`)).toEqual([]);
  });

  test("os exemplos de tests/fixtures/valido passam", async () => {
    const { problemas, totais } = await validarCatalogo(VALIDO, { hoje: HOJE });
    expect(problemas).toEqual([]);
    expect(totais).toEqual({ modelos: 2, acessorios: 1 });
  });

  test("todo padrão dos schemas tem mensagem em PT-BR", async () => {
    const padroes = new Set<string>();
    const coletar = (no: unknown): void => {
      if (Array.isArray(no)) no.forEach(coletar);
      else if (no && typeof no === "object")
        for (const [chave, valor] of Object.entries(no)) chave === "pattern" ? padroes.add(String(valor)) : coletar(valor);
    };
    for (const arquivo of ["bike.schema.json", "dica.schema.json"]) coletar(JSON.parse(await readFile(join(SCHEMAS, arquivo), "utf8")));
    expect([...padroes].filter((p) => mensagemDoPadrao(p) === null)).toEqual([]);
  });

  test("pasta da marca sem acento, espaço nem hífen", () => {
    expect(pastaDaMarca("Two Dogs")).toBe("twodogs");
    expect(pastaDaMarca("Pinarello-São")).toBe("pinarellosao");
  });
});

describe("modelos", () => {
  test("JSON quebrado aponta o arquivo", async () => {
    const problemas = await problemasCom((p) => writeFile(join(p, BIKE), "{ \"marca\": "));
    expect(problemas).toEqual([{ arquivo: BIKE, campo: "(arquivo)", mensagem: expect.stringContaining("JSON inválido") }]);
  });

  test("campo obrigatório ausente pede null", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => delete b.preco_sugerido_brl));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "preco_sugerido_brl", mensagem: expect.stringContaining("use null") });
  });

  test("campo fora do schema é recusado", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.classe_contran = "bicicleta_eletrica")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "classe_contran", mensagem: expect.stringContaining("não existe no schema") });
  });

  test("zero no lugar de desconhecido é recusado", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => ((b.componentes as Record<string, unknown>).peso_kg = 0)));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "componentes.peso_kg", mensagem: expect.stringContaining("maior que zero") });
  });

  test("URL com afiliado de outra pessoa é recusada", async () => {
    const problemas = await problemasCom((p) =>
      editarJson(p, BIKE, (b) => (b.links_compra = [{ url: "https://www.amazon.com.br/dp/B0EXEMPLO1?tag=outra-pessoa-20" }])),
    );
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "links_compra.0.url", mensagem: expect.stringContaining("parâmetros de rastreio") });
  });

  test("link encurtado é recusado", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.links_compra = [{ url: "https://amzn.to/abc123" }])));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "links_compra.0.url", mensagem: expect.stringContaining("encurtado") });
  });

  test("aro fora do padrão aponta o formato", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => ((b.quadro as Record<string, unknown>).aro = "29\"")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "quadro.aro", mensagem: expect.stringContaining("polegadas") });
  });

  test("slug diferente do nome do arquivo", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.slug = "outro-slug")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "slug", mensagem: expect.stringContaining("nome do arquivo") });
  });

  test("marca na pasta errada", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.marca = "Outra Marca")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "marca", mensagem: expect.stringContaining("models/outramarca/") });
  });

  test("categoria ebike sem o bloco ebike", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.categoria = "ebike")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "ebike", mensagem: expect.stringContaining("exige o bloco ebike") });
  });

  test("data no futuro", async () => {
    const problemas = await problemasCom((p) => editarJson(p, BIKE, (b) => (b.atualizado_em = "2027-01-01")));
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "atualizado_em", mensagem: expect.stringContaining("futuro") });
  });

  test("arquivo solto fora de models/<marca>/<slug>.json", async () => {
    const problemas = await problemasCom((p) => writeFile(join(p, "models/solto.json"), "{}"));
    expect(problemas).toContainEqual({ arquivo: "models/solto.json", campo: "(arquivo)", mensagem: expect.stringContaining("models/<pasta-da-marca>/<slug>.json") });
  });
});

describe("fotos", () => {
  test("caminho da foto diferente do modelo", async () => {
    const problemas = await problemasCom((p) =>
      editarJson(p, BIKE, (b) => ((b.imagem as Record<string, unknown>).arquivo = "exemplo/outra-bike.webp")),
    );
    expect(problemas).toContainEqual({ arquivo: BIKE, campo: "imagem.arquivo", mensagem: expect.stringContaining("exemplo/exemplo-trilha-29.webp") });
  });
});

describe("acessórios e comparações", () => {
  test("dica com slug diferente do arquivo", async () => {
    const problemas = await problemasCom((p) => editarJson(p, "acessorios/exemplo-luz-traseira.json", (d) => (d.slug = "outra-luz")));
    expect(problemas).toContainEqual({ arquivo: "acessorios/exemplo-luz-traseira.json", campo: "slug", mensagem: expect.stringContaining("nome do arquivo") });
  });

  test("dica com categoria fora da lista", async () => {
    const problemas = await problemasCom((p) => editarJson(p, "acessorios/exemplo-luz-traseira.json", (d) => (d.categoria = "roupa")));
    expect(problemas).toContainEqual({ arquivo: "acessorios/exemplo-luz-traseira.json", campo: "categoria", mensagem: expect.stringContaining("use um destes valores") });
  });

  test("comparação com modelo inexistente, par repetido e par consigo mesmo", async () => {
    const problemas = await problemasCom((p) =>
      writeFile(
        join(p, "comparisons.json"),
        JSON.stringify([
          { a: "exemplo/exemplo-trilha-29", b: "exemplo/nao-existe" },
          { a: "exemplo/exemplo-e-urbana", b: "exemplo/exemplo-trilha-29" },
          { a: "exemplo/exemplo-trilha-29", b: "exemplo/exemplo-e-urbana" },
          { a: "exemplo/exemplo-e-urbana", b: "exemplo/exemplo-e-urbana" },
        ]),
      ),
    );
    expect(problemas).toContainEqual({ arquivo: "comparisons.json", campo: "0.b", mensagem: expect.stringContaining("não existe") });
    expect(problemas).toContainEqual({ arquivo: "comparisons.json", campo: "2", mensagem: "par repetido" });
    expect(problemas).toContainEqual({ arquivo: "comparisons.json", campo: "3", mensagem: "a e b são o mesmo modelo" });
  });
});
