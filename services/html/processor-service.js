const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");

/**
 * Utilitários gerais para processamento de texto
 */
const Utils = {
  /**
   * Aplica formatação inline ao texto
   */
  applyInlineFormatting(text) {
    if (!text) return "";
    return text
      .replace(/\[NEGRITO\](.*?)\[\/NEGRITO\]/g, "<strong>$1</strong>")
      .replace(/\[ITALICO\](.*?)\[\/ITALICO\]/g, "<i>$1</i>");
  },

  /**
   * Gera um ID único
   */
  generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
  },

  /**
   * Limpa espaços em branco e parágrafos vazios
   */
  cleanContent(content) {
    if (!content) return "";

    return (
      content
        // Normaliza quebras de linha
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove múltiplas quebras de linha
        .replace(/\n{3,}/g, "\n\n")
        // Remove espaços em branco extras
        .replace(/[ \t]+/g, " ")
        // Remove parágrafos HTML vazios
        .replace(/<p>\s*<\/p>/g, "")
        // Remove quebras de linha antes de fechamento de tags
        .replace(/\n+(\s*<\/[^>]+>)/g, "$1")
        // Remove quebras de linha depois de abertura de tags
        .replace(/(<[^>]+>\s*)\n+/g, "$1")
        .trim()
    );
  },

  /**
   * Verifica se uma linha é um elemento HTML
   */
  isHtmlElement(line) {
    return /^<\/?[a-zA-Z][^>]*>$/.test(line.trim());
  },

  /**
   * Processa parágrafos de forma inteligente
   */
  processParagraphs(content) {
    if (!content) return "";

    // Primeiro limpa o conteúdo
    content = this.cleanContent(content);

    // Preserva tags HTML existentes
    const htmlPlaceholders = [];
    content = content.replace(/<[^>]+>.*?<\/[^>]+>/gs, (match) => {
      htmlPlaceholders.push(match);
      return `###HTML${htmlPlaceholders.length - 1}###`;
    });

    // Processa o texto, ignorando placeholders
    let processed = content
      .split("\n")
      .map((line) => {
        line = line.trim();
        if (!line) return "";
        if (line.startsWith("###HTML")) return line;
        return `<p>${line}</p>`;
      })
      .filter((line) => line)
      .join("\n");

    // Restaura tags HTML
    processed = processed.replace(
      /###HTML(\d+)###/g,
      (_, index) => htmlPlaceholders[parseInt(index)]
    );

    return processed;
  },

  /**
   * Pré-processa o conteúdo bruto antes de qualquer processamento de tags
   * Remove espaços em branco e quebras de linha desnecessárias entre tags
   */
  preprocessRawContent(content) {
    if (!content) return "";

    return (
      content
        // Normaliza quebras de linha
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove linhas em branco entre tags
        .replace(/\[(\/?\w+)\]\n+\[/g, "[$1][")
        // Remove linhas em branco no início/fim de tags
        .replace(/\[\w+\]\n+/g, (match) => match.replace(/\n+/g, "\n"))
        .replace(/\n+\[\/\w+\]/g, (match) => match.replace(/\n+/g, "\n"))
        // Remove múltiplas quebras de linha
        .replace(/\n{2,}/g, "\n")
        // Remove espaços em branco no início/fim
        .trim()
    );
  },
};

/**
 * Gerenciador de Templates HTML
 * Cada método processa um tipo específico de componente
 */
class TemplateManager {
  constructor() {
    this.titulos = {
      topico: "",
      aula: "",
    };
    this.navegacao = {
      anterior: null,
      proximo: null,
    };
  }

  /**
   * Processa o título do tópico
   * Tag: [TITULO_TOPICO]texto[/TITULO_TOPICO]
   * Template: <h5>texto</h5>
   */
  processTituloTopico(content) {
    this.titulos.topico = `<h5>${this.applyInlineFormatting(content)}</h5>`;
    return "";
  }

  /**
   * Processa o título da aula
   * Tag: [TITULO_AULA]texto[/TITULO_AULA]
   * Template: <h1>texto</h1>
   */
  processTituloAula(content) {
    this.titulos.aula = `<h1>${this.applyInlineFormatting(content)}</h1>`;
    return "";
  }

  /**
   * Processa uma seção
   * Tag: [SECAO]conteúdo[/SECAO]
   * Template:
   * <div class="container c-aula-container curso secao1">
   *   <section>
   *     <div class="row row-txt">
   *       <div class="col-sm-12 col-md-10 col-lg-8 col-xl-8">
   *         <div>conteúdo da seção</div>
   *         <div class="separador-menor"></div>
   *       </div>
   *     </div>
   *   </section>
   * </div>
   */
  processSecao(content) {
    // Processa o conteúdo usando o utilitário centralizado
    const processedContent = Utils.processParagraphs(content);

    return `
      <div class="container c-aula-container curso secao1">
        <section>
          <div class="row row-txt">
            <div class="col-sm-12 col-md-10 col-lg-8 col-xl-8">
              <div>${processedContent}</div>
              <div class="separador-menor"></div>
            </div>
          </div>
        </section>
      </div>`.trim();
  }

  /**
   * Aplica formatação inline ao texto
   * Tags: [NEGRITO]texto[/NEGRITO] e [ITALICO]texto[/ITALICO]
   */
  applyInlineFormatting(text) {
    if (!text) return "";
    return text
      .replace(/\[NEGRITO\](.*?)\[\/NEGRITO\]/g, "<strong>$1</strong>")
      .replace(/\[ITALICO\](.*?)\[\/ITALICO\]/g, "<i>$1</i>");
  }

  /**
   * Processa o link para o tópico anterior
   * Tag: [ANTERIOR link=/path]texto[/ANTERIOR] ou [ANTERIOR]texto[/ANTERIOR]
   * Template: <div class="topico-anterior"><span data-link="/path">texto</span><svg>...</svg></div>
   */
  processAnterior(content, link = null) {
    this.navegacao.anterior = {
      text: content || "Tópico Anterior",
      link: link || "#",
    };
    return "";
  }

  /**
   * Processa o link para o próximo tópico
   * Tag: [PROXIMO link=/path]texto[/PROXIMO] ou [PROXIMO]texto[/PROXIMO]
   * Template: <div class="proximo-topico"><span data-link="/path">texto</span><svg>...</svg></div>
   */
  processProximo(content, link = null) {
    this.navegacao.proximo = {
      text: content || "Próximo Tópico",
      link: link || "#",
    };
    return "";
  }

  /**
   * Gera o HTML de navegação
   */
  generateNavigationHTML() {
    if (!this.navegacao.anterior && !this.navegacao.proximo) return "";

    return `
      <div class="container c-aula-container curso secao1">
        <div class="row">
          <div class="col">
            <div style="display: flex;gap: 30px;justify-content: space-between;">
        ${
          this.navegacao.anterior
            ? `
          <div class="topico-anterior">
                  <span data-link="${this.navegacao.anterior.link}">${this.navegacao.anterior.text}</span>
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.028 0.97199C6.833 0.97199 1.00031 6.80468 1.00031 13.9997C1.00031 21.1947 6.833 27.0273 14.028 27.0273C21.223 27.0273 27.0557 21.1947 27.0557 13.9997C27.0557 6.80468 21.223 0.971989 14.028 0.97199Z" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M14.0283 8.7888L8.81725 13.9999L14.0283 19.2109" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M19.2393 13.9995L8.81712 13.9995" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
                </div>
              `
            : ""
        }
        ${
          this.navegacao.proximo
            ? `
          <div class="proximo-topico">
                  <span data-link="${this.navegacao.proximo.link}">${this.navegacao.proximo.text}</span>
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.0277 27.0275C21.2227 27.0275 27.0554 21.1948 27.0554 13.9998C27.0554 6.80486 21.2227 0.972168 14.0277 0.972168C6.83269 0.972168 1 6.80486 1 13.9998C1 21.1948 6.83269 27.0275 14.0277 27.0275Z" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M14.0273 19.2107L19.2384 13.9996L14.0273 8.78857" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M8.81641 14H19.2385" stroke="var(--cor-primaria)" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
                </div>
              `
            : ""
        }
            </div>
            <div class="separador-medio"></div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Gera o HTML completo da página
   */
  generateFullHTML(content) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aula Interativa</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
  <link href="https://use.typekit.net/bbo1gxr.css" rel="stylesheet" type="text/css">
  <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <link href="https://recursos-moodle.caeddigital.net/projetos/2024/municipios/css/municipios-2024.css" rel="stylesheet" type="text/css">
</head>
<body>
  <div class="container c-aula-container curso secao1">
    <div class="row">
      <div class="col">
        <div class="separador-menor"></div>
        <div class="d-center">
          <img class="img-topo-aula" src="https://recursos-moodle.caeddigital.net/projetos/2024/caed/selo-aplicador/img/topo.svg">
        </div>
        <div class="separador-menor"></div>
        <div class="titulo-topico-box">
          ${this.titulos.topico}
        </div>
        <div class="separador-menor"></div>
        <div class="row row-topo-titulo">
          <div class="col-sm-12 col-md-10 col-lg-8 col-xl-8">
            ${this.titulos.aula}
            <div class="separador-medio"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  ${content}

  ${this.generateNavigationHTML()}

  <script src="https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.slim.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.min.js"></script>
  <script src="https://recursos-moodle.caeddigital.net/projetos/2024/municipios/js/municipios.js"></script>
</body>
</html>`;
  }

  /**
   * Processa uma lista com marcadores
   * Tag: [LISTA][ITEM_LISTA]texto[/ITEM_LISTA][/LISTA]
   * Template: <ul class="lista-check"><li>texto</li></ul>
   */
  processLista(content) {
    // Limpa o conteúdo antes de processar
    content = Utils.cleanContent(content);

    // Processa cada item da lista
    const processedItems = content
      .replace(
        /\[ITEM_LISTA\](.*?)\[\/ITEM_LISTA\]/gs,
        (match, innerContent) => {
          return `<li>${this.applyInlineFormatting(innerContent.trim())}</li>`;
        }
      )
      .trim();

    return `<ul class="lista-check">${processedItems}</ul>`;
  }

  /**
   * Processa um flip card
   * Tag: [FLIP_CARD][FRENTE]texto[/FRENTE][VERSO]texto[/VERSO][/FLIP_CARD]
   * Template: <div class="caednew-flip-card">...</div>
   */
  processFlipCard(content) {
    // Limpa o conteúdo antes de processar
    content = Utils.cleanContent(content);

    let frontText = "";
    let backText = "";

    // Extrai o texto da frente
    const frontMatch = content.match(/\[FRENTE\](.*?)\[\/FRENTE\]/s);
    if (frontMatch) {
      frontText = this.applyInlineFormatting(frontMatch[1].trim());
    }

    // Extrai o texto do verso
    const backMatch = content.match(/\[VERSO\](.*?)\[\/VERSO\]/s);
    if (backMatch) {
      backText = this.applyInlineFormatting(backMatch[1].trim());
    }

    return `
      <div class="caednew-flip-card" tabindex="0">
        <div class="caednew-flip-card-inner">
          <div class="caednew-flip-card-front">
            <div class="box-imagem">
              <img src="#">
            </div>
            <div class="box-texto">
              <p class="titulo">${frontText}</p>
            </div>
          </div>
          <div class="caednew-flip-card-back">
            <p>${backText}</p>
          </div>
        </div>
      </div>`.trim();
  }
}

/**
 * Parser principal para processar documentos
 */
class AulaParser {
  constructor() {
    this.templateManager = new TemplateManager();
  }

  /**
   * Processa o conteúdo fornecido e retorna HTML
   */
  parse(inputData) {
    if (!inputData || typeof inputData !== "string") {
      console.error("Dados de entrada inválidos:", inputData);
      return "";
    }

    // Pré-processa o conteúdo bruto antes de qualquer processamento
    let content = Utils.preprocessRawContent(inputData);

    // Processa título do tópico
    content = this.processTag(
      content,
      "TITULO_TOPICO",
      (match, innerContent) => {
        this.templateManager.processTituloTopico(innerContent);
        return "";
      }
    );

    // Processa título da aula
    content = this.processTag(content, "TITULO_AULA", (match, innerContent) => {
      this.templateManager.processTituloAula(innerContent);
      return "";
    });

    // Processa flip cards
    content = this.processTag(content, "FLIP_CARD", (match, innerContent) => {
      return this.templateManager.processFlipCard(innerContent);
    });

    // Processa listas
    content = this.processTag(content, "LISTA", (match, innerContent) => {
      return this.templateManager.processLista(innerContent);
    });

    // Processa link anterior (com atributos)
    content = this.processTag(
      content,
      "ANTERIOR",
      (match, innerContent, attributes) => {
        const linkMatch = attributes
          ? attributes.match(/link=(.*?)(?:\s|$)/)
          : null;
        const link = linkMatch ? linkMatch[1].trim() : "";
        this.templateManager.processAnterior(innerContent, link);
        return "";
      },
      true
    );

    // Processa link anterior (sem atributos)
    content = this.processTag(content, "ANTERIOR", (match, innerContent) => {
      this.templateManager.processAnterior(innerContent);
      return "";
    });

    // Processa link próximo (com atributos)
    content = this.processTag(
      content,
      "PROXIMO",
      (match, innerContent, attributes) => {
        const linkMatch = attributes
          ? attributes.match(/link=(.*?)(?:\s|$)/)
          : null;
        const link = linkMatch ? linkMatch[1].trim() : "";
        this.templateManager.processProximo(innerContent, link);
        return "";
      },
      true
    );

    // Processa link próximo (sem atributos)
    content = this.processTag(content, "PROXIMO", (match, innerContent) => {
      this.templateManager.processProximo(innerContent);
      return "";
    });

    // Processa seções
    let processedSections = "";
    content = this.processTag(content, "SECAO", (match, innerContent) => {
      // Processamos a seção e a adicionamos diretamente à saída final
      const processedSection = this.templateManager.processSecao(
        this.processParágrafos(innerContent)
      );
      processedSections += processedSection;
      return ""; // Removemos a seção do texto original
    });

    // Processa parágrafos restantes fora de seções
    if (content.trim()) {
      processedSections += this.templateManager.processSecao(
        this.processParágrafos(content)
      );
    }

    // Gera o HTML final incluindo as seções processadas
    return this.templateManager.generateFullHTML(processedSections);
  }

  /**
   * Processa uma tag específica no conteúdo
   * @param {string} content - Conteúdo a ser processado
   * @param {string} tagName - Nome da tag a ser processada
   * @param {Function} processor - Função que processa o conteúdo da tag
   * @param {boolean} hasAttributes - Indica se a tag tem atributos
   * @returns {string} - Conteúdo processado
   */
  processTag(content, tagName, processor, hasAttributes = false) {
    if (!content) return "";

    const pattern = hasAttributes
      ? `\\[${tagName}\\s+(.*?)\\](.*?)\\[\\/${tagName}\\]`
      : `\\[${tagName}\\](.*?)\\[\\/${tagName}\\]`;

    // Usamos 'gs' para que a regex funcione com múltiplas linhas e capture todas as ocorrências
    const regex = new RegExp(pattern, "gs");

    return content.replace(regex, (match, p1, p2) => {
      if (hasAttributes) {
        const attributes = p1;
        const innerContent = p2;
        return processor(match, innerContent.trim(), attributes);
      } else {
        const innerContent = p1;
        return processor(match, innerContent.trim());
      }
    });
  }

  /**
   * Processa o texto, transformando parágrafos e aplicando formatação inline
   */
  processParágrafos(content) {
    if (!content) return "";

    // Remove tags [PARAGRAFO] se existirem
    content = content.replace(/\[PARAGRAFO\](.*?)\[\/PARAGRAFO\]/gs, "$1");

    // Aplica formatação inline
    content = this.templateManager.applyInlineFormatting(content);

    // Divide o texto em parágrafos, filtra linhas vazias e espaços em branco
    const paragraphs = content
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p !== "" && p !== "<p></p>") // Remove linhas vazias e parágrafos vazios
      .map((p) => `<p>${p}</p>`)
      .join("\n");

    return paragraphs;
  }
}

/**
 * Função principal que processa os tópicos e gera o HTML completo
 */
function processarAula(inputData) {
  try {
    if (!inputData || typeof inputData !== "string") {
      console.error("Dados de entrada inválidos:", inputData);
      return {
        error: "Dados de entrada inválidos ou vazios",
        htmls: [],
        titles: [],
      };
    }

    // Pré-processa o conteúdo bruto
    inputData = Utils.preprocessRawContent(inputData);

    // Separa o input em tópicos se contiver a tag [TOPICO]
    let topicos = [];
    if (inputData.includes("[TOPICO]")) {
      topicos = inputData
        .split(/\[TOPICO\]/g)
        .filter((t) => t.trim() !== "")
        .map((t) => t.replace(/\[\/TOPICO\]/g, "").trim());
    } else {
      topicos.push(inputData);
    }

    if (!topicos.length) {
      console.error("Nenhum tópico encontrado no documento");
      return {
        error: "Nenhum tópico encontrado no documento",
        htmls: [],
        titles: [],
      };
    }

    const parser = new AulaParser();
    const htmls = [];
    const titles = [];

    // Processar cada tópico e extrair seus títulos
    topicos.forEach((topico, index) => {
      if (!topico) {
        htmls.push("");
        titles.push(`Tópico ${index + 1}`);
        return;
      }

      // Extrair o título do tópico antes de processá-lo
      const titleMatch = topico.match(
        /\[TITULO_TOPICO\](.*?)\[\/TITULO_TOPICO\]/s
      );
      const title =
        titleMatch && titleMatch[1]
          ? titleMatch[1].trim()
          : `Tópico ${index + 1}`;

      // Remover formatações inline do título para uso como nome de arquivo
      const cleanTitle = title
        .replace(/\[NEGRITO\](.*?)\[\/NEGRITO\]/g, "$1")
        .replace(/\[ITALICO\](.*?)\[\/ITALICO\]/g, "$1");

      // Adicionar o título à lista
      titles.push(cleanTitle);

      // Processar o HTML do tópico
      htmls.push(parser.parse(topico));
    });

    return { htmls, titles };
  } catch (error) {
    console.error("Erro ao processar aula:", error);
    return { error: error.message, htmls: [], titles: [] };
  }
}

/**
 * Cria um arquivo zip com os HTMLs gerados
 */
async function createZipFromHTMLs(htmls, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      output.on("close", () => {
        console.log(`Arquivo zip criado: ${outputPath}`);
        resolve(outputPath);
      });

      archive.on("error", (err) => {
        reject(err);
      });

      archive.pipe(output);

      htmls.forEach((html, index) => {
        const fileName = `topico_${index + 1}.html`;
        archive.append(html, { name: fileName });
      });

      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  processarAula,
  createZipFromHTMLs,
};
