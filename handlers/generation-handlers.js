const { ipcMain } = require("electron");
const fs = require("fs-extra");
const path = require("path");
const { downloadsPath } = require("../config/app-config");
const { downloadFile } = require("../services/drive-service");
const {
  extractTextFromDocx,
  processAllResources,
} = require("../services/document-service");
const {
  generateTempFileName,
  getTempFilePath,
} = require("../utils/file-utils");

/**
 * Configura os handlers IPC relacionados à geração de recursos
 * @param {BrowserWindow} mainWindow - Janela principal do Electron
 */
function setupGenerationHandlers(mainWindow) {
  /**
   * Gerar Aula a partir de um arquivo .docx (baixar, extrair texto, etc.)
   */
  ipcMain.handle("gerar-aula", async (event, fileId, fileName) => {
    try {
      console.log(
        `Iniciando geração de aula para fileId=${fileId}, fileName=${fileName}`
      );

      // 1) Sanitizar o nome do arquivo para evitar problemas com caracteres especiais
      const sanitizedFileName = generateTempFileName(fileId);
      const filePath = getTempFilePath(sanitizedFileName, downloadsPath);

      console.log(`Nome de arquivo sanitizado: ${sanitizedFileName}`);
      console.log(`Caminho completo: ${filePath}`);

      // 2) Baixar o arquivo do Google Drive
      try {
        const downloadResult = await downloadFile(fileId, filePath);
        console.log("Download concluído com sucesso:", downloadResult);
      } catch (downloadError) {
        console.error("Erro durante o download do arquivo:", downloadError);
        throw new Error(`Falha no download: ${downloadError.message}`);
      }

      // 3) Extrair texto do documento
      try {
        const textoExtraido = await extractTextFromDocx(filePath);
        console.log("Texto extraído com sucesso");

        // 4) Iniciar processamento de recursos em paralelo
        console.log(
          "Iniciando processamento paralelo com múltiplos webhooks..."
        );

        // Objeto para armazenar os resultados dos webhooks
        const results = {
          braille: null,
          audio: null,
          pdf: null,
          questoes: null,
        };

        // Status inicial, será atualizado conforme os webhooks responderem
        const status = {
          braille: "pending",
          audio: "pending",
          pdf: "pending",
          questoes: "pending",
        };

        // Função para enviar atualizações para o frontend sobre o progresso do processamento
        const sendProcessingUpdate = () => {
          if (mainWindow) {
            mainWindow.webContents.send("resource-update", {
              fileId: fileId,
              status: status,
              results: results,
              localPath: filePath,
            });
          }
        };

        // Enviar a primeira atualização de status
        sendProcessingUpdate();

        // Processar recursos em segundo plano e aguardar conclusão
        await processAllResources(textoExtraido, fileName, fileId)
          .then((processingResult) => {
            // Atualizar os resultados e status
            Object.assign(results, processingResult.results);
            Object.assign(status, processingResult.status);

            // Enviar atualização final para o frontend
            sendProcessingUpdate();
            console.log(
              "Processamento concluído com sucesso. Atualizando frontend."
            );
          })
          .catch((processingError) => {
            console.error(
              "Erro no processamento de recursos:",
              processingError
            );

            // Atualizar status com erro
            Object.keys(status).forEach((key) => {
              if (status[key] === "processing") {
                status[key] = "error";
                results[key] = { error: processingError.message };
              }
            });

            // Enviar atualização de erro para o frontend
            sendProcessingUpdate();
          });

        // Verificar e registrar valores das URLs
        console.log(
          "Links encontrados (audio):",
          results.audio?.url,
          results.audio?.mp3Link
        );
        console.log(
          "Links encontrados (pdf):",
          results.pdf?.url,
          results.pdf?.pdfLink
        );
        console.log(
          "Links encontrados (questoes):",
          results.questoes?.url,
          results.questoes?.questoesLink
        );

        // Validar recursos e construir uma lista de recursos disponíveis
        const resourcesAvailable = [];
        if (results.audio?.url || results.audio?.mp3Link)
          resourcesAvailable.push("Áudio");
        if (results.pdf?.url || results.pdf?.pdfLink)
          resourcesAvailable.push("PDF");
        if (results.questoes?.url || results.questoes?.questoesLink)
          resourcesAvailable.push("Questões");

        // Reconstruir os links manualmente se estiverem faltando mas tivermos um driveId
        let audioLink = results.audio?.mp3Link || results.audio?.url || null;
        let pdfLink = results.pdf?.pdfLink || results.pdf?.url || null;
        let questoesLink =
          results.questoes?.questoesLink || results.questoes?.url || null;

        // Se o link estiver faltando mas temos o driveId, construir o link
        if (!audioLink && results.audio?.driveId) {
          audioLink = `https://drive.google.com/uc?export=download&id=${results.audio.driveId}`;
          console.log(
            "Reconstruído link de áudio a partir do driveId:",
            audioLink
          );
        }

        if (!pdfLink && results.pdf?.driveId) {
          pdfLink = `https://drive.google.com/uc?export=download&id=${results.pdf.driveId}`;
          console.log("Reconstruído link de PDF a partir do driveId:", pdfLink);
        }

        // Tentar obter o driveId do PDF de qualquer propriedade que pareça um ID
        if (!pdfLink && results.pdf) {
          console.log(
            "Tentando obter driveId alternativo para PDF de:",
            JSON.stringify(results.pdf)
          );
          Object.keys(results.pdf).forEach((key) => {
            if (
              key.toLowerCase().includes("id") &&
              !key.toLowerCase().includes("file") &&
              results.pdf[key]
            ) {
              console.log(
                `Possível driveId encontrado no campo ${key}:`,
                results.pdf[key]
              );
              pdfLink = `https://drive.google.com/uc?export=download&id=${results.pdf[key]}`;
              console.log(
                "Reconstruído link de PDF usando campo alternativo:",
                pdfLink
              );
            }
          });
        }

        if (!questoesLink && results.questoes?.driveId) {
          questoesLink = `https://drive.google.com/uc?export=download&id=${results.questoes.driveId}`;
          console.log(
            "Reconstruído link de questões a partir do driveId:",
            questoesLink
          );
        }

        // Tentar obter o driveId das questões de qualquer propriedade que pareça um ID
        if (!questoesLink && results.questoes) {
          console.log(
            "Tentando obter driveId alternativo para questões de:",
            JSON.stringify(results.questoes)
          );
          Object.keys(results.questoes).forEach((key) => {
            if (
              key.toLowerCase().includes("id") &&
              !key.toLowerCase().includes("file") &&
              results.questoes[key]
            ) {
              console.log(
                `Possível driveId encontrado no campo ${key}:`,
                results.questoes[key]
              );
              questoesLink = `https://drive.google.com/uc?export=download&id=${results.questoes[key]}`;
              console.log(
                "Reconstruído link de questões usando campo alternativo:",
                questoesLink
              );
            }
          });
        }

        // Montar uma resposta normalizada para retorno
        const normalizedResponse = {
          brailleLink: null,
          mp3Link: audioLink,
          pdfLink: pdfLink,
          questoesLink: questoesLink,
          // Informações sobre o status do processamento
          processingStatus: "completed",
          message: `Processamento concluído. Recursos disponíveis: ${resourcesAvailable.join(
            ", "
          )}.`,
          localPath: filePath,
        };

        // Uma atualização final para garantir que todos os status sejam atualizados
        if (mainWindow) {
          // Criar objetos de resultado apenas para links que existem
          const finalResults = {};

          if (normalizedResponse.mp3Link) {
            finalResults.audio = {
              mp3Link: normalizedResponse.mp3Link,
              url: normalizedResponse.mp3Link,
              driveId: normalizedResponse.mp3Link.match(/id=([^&]+)/)?.[1],
            };
          }

          if (normalizedResponse.pdfLink) {
            finalResults.pdf = {
              pdfLink: normalizedResponse.pdfLink,
              url: normalizedResponse.pdfLink,
              driveId: normalizedResponse.pdfLink.match(/id=([^&]+)/)?.[1],
            };
          }

          if (normalizedResponse.questoesLink) {
            finalResults.questoes = {
              questoesLink: normalizedResponse.questoesLink,
              url: normalizedResponse.questoesLink,
              driveId: normalizedResponse.questoesLink.match(/id=([^&]+)/)?.[1],
            };
          }

          // Determinar status real baseado nos links disponíveis
          const finalStatus = {
            audio: finalResults.audio ? "completed" : "error",
            pdf: finalResults.pdf ? "completed" : "error",
            questoes: finalResults.questoes ? "completed" : "error",
          };

          console.log("Enviando atualização final com links validados:", {
            status: finalStatus,
            results: finalResults,
          });

          mainWindow.webContents.send("final-update", {
            fileId: fileId,
            status: finalStatus,
            results: finalResults,
            processingStatus: "completed",
          });
        }

        console.log(
          "Retornando resposta final:",
          JSON.stringify(normalizedResponse, null, 2)
        );
        return normalizedResponse;
      } catch (processingError) {
        console.error("Erro ao processar o arquivo DOCX:", processingError);

        // Tentar remover arquivo potencialmente corrompido
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkError) {
          console.error("Erro ao remover arquivo:", unlinkError);
        }

        throw new Error(
          `Falha ao processar o arquivo: ${processingError.message}`
        );
      }
    } catch (error) {
      console.error("Erro ao gerar aula:", error.message);
      return { error: error.message };
    }
  });

  console.log("Handlers de geração configurados com sucesso");
}

module.exports = {
  setupGenerationHandlers,
};
