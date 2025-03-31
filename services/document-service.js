const mammoth = require("mammoth");
const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
const { webhookUrls } = require("../config/app-config");
const { gerarPDF } = require("./pdf-service");
const { gerarDocxQuestoes } = require("./docx-service");

/**
 * Extrai texto de um arquivo DOCX
 * @param {string} filePath - Caminho do arquivo DOCX
 * @returns {Promise<string>} - Texto extraído
 */
async function extractTextFromDocx(filePath) {
  try {
    const docxBuffer = fs.readFileSync(filePath);
    console.log(`Tamanho do buffer: ${docxBuffer.length} bytes`);

    // Verificar se o arquivo é realmente um DOCX válido
    if (docxBuffer.length < 100) {
      throw new Error("Arquivo DOCX inválido ou muito pequeno");
    }

    // Opções para extração de texto com mais formatação
    const extractionOptions = {
      buffer: docxBuffer,
      extractAPIInfo: true,
      includeEmbeddedStyleMap: true,
      preserveNumbering: true,
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p => p:fresh",
      ],
    };

    console.log("Tentando extrair texto com opções avançadas...");

    // Primeiro tente extrair com HTML para preservar mais formatação
    const htmlResult = await mammoth.convertToHtml(extractionOptions);
    // Depois tente extrair apenas o texto bruto
    const textResult = await mammoth.extractRawText(extractionOptions);

    console.log(
      "Mensagens de aviso da extração:",
      JSON.stringify(htmlResult.messages || textResult.messages || [])
    );

    // Vamos usar o HTML se disponível, senão o texto puro
    let textoExtraido = htmlResult.value || textResult.value || "";

    // Se o HTML foi extraído, vamos converter para texto simples para casos onde só queremos o texto
    if (htmlResult.value && htmlResult.value.length > textResult.value.length) {
      console.log("Usando extração HTML, que contém mais conteúdo");
      // Remover tags HTML de maneira simples para obter texto
      textoExtraido = htmlResult.value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Verificar se o texto extraído tem conteúdo real (não apenas whitespace)
    if (!textoExtraido || textoExtraido.trim().length < 10) {
      console.error(
        "Texto extraído está vazio ou contém apenas whitespace:",
        JSON.stringify(textoExtraido)
      );

      // Última tentativa: tentar ler o arquivo como texto simples
      try {
        const rawContent = docxBuffer.toString("utf8");
        const textContent = rawContent
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .trim();

        if (textContent.length > 50) {
          console.log("Usando extração alternativa de texto");
          textoExtraido = "EXTRAÇÃO ALTERNATIVA:\n\n" + textContent;
        } else {
          throw new Error("Não foi possível extrair texto legível do arquivo");
        }
      } catch (e) {
        throw new Error(
          "Não foi possível extrair texto do arquivo: " + e.message
        );
      }
    }

    console.log("Texto extraído (início):", textoExtraido.slice(0, 100), "...");
    return textoExtraido;
  } catch (error) {
    console.error("Erro ao processar o arquivo DOCX:", error);
    throw error;
  }
}

/**
 * Envia um recurso para processamento através do webhook
 * @param {string} textoExtraido - Texto extraído do documento
 * @param {string} fileName - Nome do arquivo
 * @param {string} fileId - ID do arquivo no Google Drive
 * @param {string} resourceType - Tipo de recurso (braille, audio, pdf, questoes)
 * @returns {Promise<Object>} - Resposta do webhook
 */
async function processResource(textoExtraido, fileName, fileId, resourceType) {
  try {
    if (!webhookUrls[resourceType]) {
      throw new Error(`Tipo de recurso inválido: ${resourceType}`);
    }

    console.log(`Processando recurso ${resourceType} para ${fileName}`);

    // Enviar a requisição para o webhook
    const response = await axios.post(webhookUrls[resourceType], {
      textoExtraido: textoExtraido,
      fileName: fileName,
      fileId: fileId,
    });

    console.log(`Resposta do webhook ${resourceType}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Erro no processamento de ${resourceType}:`, error);
    throw error;
  }
}

/**
 * Processa múltiplos recursos em paralelo
 * @param {string} textoExtraido - Texto extraído do documento
 * @param {string} fileName - Nome do arquivo
 * @param {string} fileId - ID do arquivo no Google Drive
 * @returns {Promise<Object>} - Status e resultados do processamento
 */
async function processAllResources(textoExtraido, fileName, fileId) {
  // Objeto para armazenar os resultados dos webhooks
  const results = {
    audio: null,
    pdf: null,
    questoes: null,
  };

  // Status inicial, será atualizado conforme os webhooks responderem
  const status = {
    audio: "pending",
    pdf: "pending",
    questoes: "pending",
  };

  // Lista de promessas para aguardar todos os processamentos
  const processingPromises = [];

  // Processar áudio via webhook (já implementado)
  processingPromises.push(
    (async () => {
      try {
        console.log("Iniciando processamento do áudio via webhook");
        status.audio = "processing";

        // Verificar e exibir o URL que está sendo utilizado
        console.log(`Enviando para webhook de áudio: ${webhookUrls.audio}`);

        // Enviar a requisição para o webhook específico com timeout e tratamento de erro
        const response = await axios.post(
          webhookUrls.audio,
          {
            textoExtraido: textoExtraido,
            fileName: fileName,
            fileId: fileId,
          },
          {
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }
        );

        console.log(
          "Resposta do webhook de áudio:",
          JSON.stringify(response.data, null, 2)
        );

        // Armazenar o resultado e garantir que temos URLs válidos
        results.audio = {
          ...response.data,
          // Garantir que pelo menos um URL está disponível
          url: response.data.url || response.data.mp3Link,
        };
        status.audio = "completed";

        console.log("Resultado final do áudio:", results.audio);

        return {
          resourceType: "audio",
          status: "completed",
          result: response.data,
        };
      } catch (error) {
        console.error("Erro no processamento de áudio:", error);
        status.audio = "error";
        results.audio = { error: error.message };

        return { resourceType: "audio", status: "error", error: error.message };
      }
    })()
  );

  // Processar PDF localmente
  processingPromises.push(
    (async () => {
      try {
        console.log("Iniciando processamento do PDF localmente");
        status.pdf = "processing";

        // Gerar PDF localmente
        const pdfResult = await gerarPDF(textoExtraido, fileName, fileId);

        // Criar FormData para envio do arquivo
        const formData = new FormData();
        formData.append("file", fs.createReadStream(pdfResult.filePath));
        formData.append("fileName", path.basename(pdfResult.fileName));
        formData.append("fileId", fileId);
        formData.append("originalFileName", fileName);

        // DEBUG: registrar o tamanho do arquivo que está sendo enviado
        const fileStats = fs.statSync(pdfResult.filePath);
        console.log(
          `Enviando arquivo PDF: ${pdfResult.filePath}, tamanho: ${fileStats.size} bytes`
        );

        let response;
        try {
          // Enviar o PDF para o webhook de upload
          console.log(`PDF gerado, enviando para webhook: ${webhookUrls.pdf}`);
          response = await axios.post(webhookUrls.pdf, formData, {
            headers: {
              ...formData.getHeaders(),
              "Content-Type": "multipart/form-data",
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 60000, // 60 segundos de timeout para arquivos grandes
          });

          // Verificar e registrar a resposta completa
          console.log("Resposta completa do webhook de upload PDF:");
          console.log(JSON.stringify(response.data, null, 2));

          console.log("Resposta do webhook de upload do PDF:", response.data);
        } catch (uploadError) {
          console.error("Erro durante o upload do PDF:", uploadError);

          // Definir objeto de resposta com erro para não falhar depois
          response = { data: { error: uploadError.message } };
          status.pdf = "error";
          results.pdf = { error: uploadError.message };

          // Não lançar o erro para permitir que outros recursos continuem
          console.warn("Continuando processamento apesar do erro no PDF");
        }

        // Validar a resposta somente se não houve erro
        if (response && response.data) {
          // Registrar a resposta para debug detalhado
          console.log("Validando resposta do webhook de PDF:");
          console.log("Tem URL?", !!response.data.url);
          console.log("Tem pdfLink?", !!response.data.pdfLink);
          console.log("Tem error?", !!response.data.error);
          console.log("Tem driveId?", !!response.data.driveId);

          if (
            !response.data.url &&
            !response.data.pdfLink &&
            !response.data.error &&
            !response.data.driveId
          ) {
            console.error(
              "Resposta do webhook de PDF não contém URLs válidos:",
              JSON.stringify(response.data, null, 2)
            );
          }
        }

        // Armazenar o resultado e garantir que temos URLs válidos
        // Verificar se não há erro antes de tentar acessar os URLs
        if (response && response.data && !response.data.error) {
          results.pdf = {
            ...response.data,
            // Garantir que pelo menos um URL está disponível
            url:
              response.data.url ||
              response.data.pdfLink ||
              (response.data.driveId
                ? `https://drive.google.com/file/d/${response.data.driveId}/view`
                : null),
            pdfLink:
              response.data.pdfLink ||
              response.data.url ||
              (response.data.driveId
                ? `https://drive.google.com/uc?export=download&id=${response.data.driveId}`
                : null),
          };
          status.pdf = "completed";

          console.log(
            "Resultado final do PDF:",
            JSON.stringify(results.pdf, null, 2)
          );
        }

        return {
          resourceType: "pdf",
          status: "completed",
          result: response.data,
        };
      } catch (error) {
        console.error("Erro no processamento de PDF:", error);
        status.pdf = "error";
        results.pdf = { error: error.message };

        return { resourceType: "pdf", status: "error", error: error.message };
      }
    })()
  );

  // Processar questões via webhook - processo em duas etapas:
  // 1. Obter conteúdo da IA,
  // 2. Gerar DOCX localmente e fazer upload
  processingPromises.push(
    (async () => {
      try {
        console.log("Iniciando processamento de questões via webhook");
        status.questoes = "processing";

        // 1. Obter o conteúdo gerado pela IA via webhook
        console.log("Enviando texto para gerar questões e resumo...");
        console.log(
          `Texto extraído (primeiros 100 caracteres): ${textoExtraido.substring(
            0,
            100
          )}...`
        );
        console.log(
          `Tamanho total do texto extraído: ${textoExtraido.length} caracteres`
        );

        const responseGPT = await axios.post(
          webhookUrls.questoes,
          {
            textoExtraido: textoExtraido,
            fileName: fileName,
            fileId: fileId,
          },
          {
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 50000, // 50 segundos de timeout
          }
        );

        console.log("Conteúdo gerado pela IA recebido");
        if (!responseGPT.data) {
          console.error("Resposta vazia da IA");
          throw new Error("Resposta vazia da IA");
        }

        if (!responseGPT.data.conteudoGerado) {
          console.error(
            "Resposta sem conteúdo gerado:",
            JSON.stringify(responseGPT.data).substring(0, 500)
          );
          throw new Error("Resposta da IA não contém campo 'conteudoGerado'");
        }

        const conteudoGerado = responseGPT.data.conteudoGerado;
        console.log(
          `Conteúdo gerado (primeiros 100 caracteres): ${conteudoGerado.substring(
            0,
            100
          )}...`
        );
        console.log(
          `Tamanho do conteúdo gerado: ${conteudoGerado.length} caracteres`
        );

        // 2. Gerar o arquivo DOCX localmente
        console.log("Gerando arquivo DOCX com as questões e resumo...");

        // Verificar se o conteúdo gerado segue o formato esperado
        const hasResumo = conteudoGerado.includes("## RESUMO");
        const hasQuestoes = conteudoGerado.includes("## QUESTÕES");

        if (!hasResumo || !hasQuestoes) {
          console.warn("Conteúdo gerado não contém as seções esperadas!");
          console.warn("Tem resumo:", hasResumo);
          console.warn("Tem questões:", hasQuestoes);
          console.warn(
            "Primeiros 200 caracteres:",
            conteudoGerado.substring(0, 200)
          );
          // Vamos continuar mesmo assim, mas registramos o problema
        }

        const docxResult = await gerarDocxQuestoes(
          conteudoGerado,
          fileName,
          fileId
        );

        // 3. Enviar o DOCX para o webhook de upload
        console.log("DOCX gerado, enviando para webhook de upload...");

        // Criar FormData para envio do arquivo
        const formData = new FormData();
        // Importante: o campo deve ser chamado "file" para o webhook processar corretamente
        formData.append("file", fs.createReadStream(docxResult.filePath));
        formData.append("fileName", path.basename(docxResult.fileName));
        formData.append("fileId", fileId);
        formData.append("originalFileName", fileName);

        // DEBUG: registrar o tamanho do arquivo que está sendo enviado
        const fileStats = fs.statSync(docxResult.filePath);
        console.log(
          `Enviando arquivo DOCX: ${docxResult.filePath}, tamanho: ${fileStats.size} bytes`
        );

        let responseUpload;
        try {
          // Enviar para o webhook de upload
          console.log(`Enviando para webhook: ${webhookUrls.uploadQuestoes}`);
          responseUpload = await axios.post(
            webhookUrls.uploadQuestoes,
            formData,
            {
              headers: {
                ...formData.getHeaders(),
                "Content-Type": "multipart/form-data",
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              timeout: 60000, // 60 segundos de timeout para arquivos grandes
            }
          );

          // Verificar e registrar a resposta completa
          console.log("Resposta completa do webhook de upload questões:");
          console.log("Raw response:", responseUpload.data);
          console.log(
            "Stringified:",
            JSON.stringify(responseUpload.data, null, 2)
          );

          // Verificar se a resposta está vazia ou é uma string HTML (indicando possível erro 404/500)
          if (
            typeof responseUpload.data === "string" &&
            responseUpload.data.includes("<!DOCTYPE html>")
          ) {
            console.error(
              "Resposta HTML recebida em vez de JSON. Possível erro no servidor n8n."
            );
            // Tentar extrair mensagem de erro da resposta HTML
            const errorMatch = responseUpload.data.match(/<pre>([^<]+)<\/pre>/);
            if (errorMatch && errorMatch[1]) {
              console.error("Erro detectado:", errorMatch[1]);
            }

            // Criar uma resposta válida para não quebrar o fluxo
            responseUpload.data = {
              error: "Resposta HTML recebida do servidor",
              htmlResponse: true,
            };
          }

          console.log(
            "Resposta do webhook de upload de questões:",
            responseUpload.data
          );
        } catch (uploadError) {
          console.error("Erro durante o upload do DOCX:", uploadError);

          // Definir objeto de resposta com erro para não falhar depois
          responseUpload = { data: { error: uploadError.message } };
          status.questoes = "error";
          results.questoes = { error: uploadError.message };

          // Não lançar o erro para permitir que outros recursos continuem
          console.warn("Continuando processamento apesar do erro nas questões");
        }

        // Validar a resposta somente se não houve erro
        if (responseUpload && responseUpload.data) {
          // Registrar a resposta para debug detalhado
          console.log("Validando resposta do webhook de questões:");
          console.log(
            "Resposta completa:",
            JSON.stringify(responseUpload.data, null, 2)
          );
          console.log("Tem URL?", !!responseUpload.data.url);
          console.log("Tem questoesLink?", !!responseUpload.data.questoesLink);
          console.log("Tem error?", !!responseUpload.data.error);
          console.log("Tem driveId?", !!responseUpload.data.driveId);

          // Tentar obter driveId de outros campos
          Object.keys(responseUpload.data).forEach((key) => {
            if (
              typeof responseUpload.data[key] === "string" &&
              responseUpload.data[key].length > 20 &&
              /^[A-Za-z0-9_-]{20,}$/.test(responseUpload.data[key])
            ) {
              console.log(
                `Possível driveId encontrado em campo '${key}':`,
                responseUpload.data[key]
              );
            }
          });

          if (
            !responseUpload.data.url &&
            !responseUpload.data.questoesLink &&
            !responseUpload.data.error &&
            !responseUpload.data.driveId
          ) {
            console.error(
              "Resposta do webhook de questões não contém URLs válidos:",
              JSON.stringify(responseUpload.data, null, 2)
            );
          }
        }

        // Armazenar o resultado final e garantir que temos URLs válidos
        // Verificar se não há erro antes de tentar acessar os URLs
        if (
          responseUpload &&
          responseUpload.data &&
          !responseUpload.data.error
        ) {
          results.questoes = {
            ...responseUpload.data,
            // Garantir que pelo menos um URL está disponível
            url:
              responseUpload.data.url ||
              responseUpload.data.questoesLink ||
              (responseUpload.data.driveId
                ? `https://drive.google.com/file/d/${responseUpload.data.driveId}/view`
                : null),
            questoesLink:
              responseUpload.data.questoesLink ||
              responseUpload.data.url ||
              (responseUpload.data.driveId
                ? `https://drive.google.com/uc?export=download&id=${responseUpload.data.driveId}`
                : null),
          };
          status.questoes = "completed";

          console.log(
            "Resultado final das questões:",
            JSON.stringify(results.questoes, null, 2)
          );
        }

        return {
          resourceType: "questoes",
          status: status.questoes,
          result: responseUpload
            ? responseUpload.data
            : { error: "Falha no processamento" },
        };
      } catch (error) {
        console.error("Erro no processamento de questões:", error);
        status.questoes = "error";
        results.questoes = { error: error.message };

        return {
          resourceType: "questoes",
          status: "error",
          error: error.message,
        };
      }
    })()
  );

  // Aguardar que todos os processamentos sejam concluídos ou falhem
  const promiseResults = await Promise.allSettled(processingPromises);

  // Registrar resultado de cada promessa para debug
  promiseResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(
        `Processamento ${index} concluído com sucesso:`,
        result.value?.resourceType
      );
    } else {
      console.error(`Processamento ${index} falhou:`, result.reason);
    }
  });

  // Verificar se todos os recursos foram processados corretamente
  const allCompleted = Object.values(status).every(
    (s) => s === "completed" || s === "error"
  );
  if (!allCompleted) {
    console.warn(
      "Alguns recursos não foram completamente processados:",
      status
    );
  } else {
    console.log(
      "Todos os recursos foram processados. Status final:",
      JSON.stringify(status)
    );
  }

  return {
    status,
    results,
    processingStatus: allCompleted ? "completed" : "partial",
  };
}

module.exports = {
  extractTextFromDocx,
  processResource,
  processAllResources,
};
