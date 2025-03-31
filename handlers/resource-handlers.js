const { ipcMain } = require("electron");
const { processResource } = require("../services/document-service");
const { extractTextFromDocx } = require("../services/document-service");
const { downloadResource } = require("../utils/file-utils");
const { gerarPDF } = require("../services/pdf-service");
const fs = require("fs-extra");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");

/**
 * Configura os handlers IPC relacionados ao processamento e download de recursos
 * @param {BrowserWindow} mainWindow - Janela principal do Electron
 */
function setupResourceHandlers(mainWindow) {
  /**
   * Handler para processar recursos individuais manualmente
   */
  /**
   * Processa PDF localmente e envia para o servidor n8n para upload no Google Drive
   */
  ipcMain.handle("processar-pdf-local", async (event, { fileId, fileName, textoExtraido }) => {
    try {
      console.log(`Gerando PDF localmente para ${fileName}...`);
      
      // Gerar o PDF localmente com o serviço
      const pdfResult = await gerarPDF(textoExtraido, fileName, fileId);
      
      // Enviar o PDF gerado para o webhook de upload do n8n
      console.log("PDF gerado, enviando para o webhook de upload...");
      
      // Criar FormData para envio do arquivo
      const formData = new FormData();
      formData.append('file', fs.createReadStream(pdfResult.filePath));
      formData.append('fileName', path.basename(pdfResult.fileName));
      formData.append('fileId', fileId);
      formData.append('originalFileName', fileName);
      
      // Enviar para o webhook de upload no n8n
      const uploadResponse = await axios.post('http://localhost:5678/webhook/upload-pdf', 
        formData, 
        { 
          headers: {
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      
      console.log("Resposta do upload:", uploadResponse.data);
      
      // Enviar atualização para o frontend
      if (mainWindow) {
        mainWindow.webContents.send("resource-update", {
          fileId,
          resourceType: "pdf",
          result: uploadResponse.data,
          status: "completed"
        });
      }
      
      return uploadResponse.data;
    } catch (error) {
      console.error("Erro ao processar PDF localmente:", error);
      
      // Enviar atualização de erro para o frontend
      if (mainWindow) {
        mainWindow.webContents.send("resource-update", {
          fileId,
          resourceType: "pdf",
          result: { error: error.message },
          status: "error"
        });
      }
      
      return { error: error.message };
    }
  });

  /**
   * Handler para processar recursos individuais através do webhook n8n
   */
  ipcMain.handle(
    "process-resource",
    async (event, { fileId, resourceType, fileName, filePath }) => {
      try {
        if (!fileId || !resourceType || !fileName) {
          throw new Error("Parâmetros insuficientes para processar o recurso");
        }

        // Extrair o texto novamente se necessário
        let textoExtraido;
        if (filePath && fs.existsSync(filePath)) {
          textoExtraido = await extractTextFromDocx(filePath);
        } else {
          throw new Error("Arquivo não encontrado para processamento");
        }

        // Se for PDF, processar localmente
        if (resourceType === "pdf") {
          return await ipcMain.emit("processar-pdf-local", event, {
            fileId,
            fileName,
            textoExtraido
          });
        }

        // Processar o recurso específico através do webhook
        const result = await processResource(
          textoExtraido,
          fileName,
          fileId,
          resourceType
        );

        // Enviar atualização para o frontend
        if (mainWindow) {
          // Garantir que temos URLs válidos na resposta
          const enhancedResult = {
            ...result,
            // Garantir que pelo menos um tipo de URL está disponível
            url: result.url || result.pdfLink || result.questoesLink || result.mp3Link,
          };
          
          console.log(`Enviando atualização para o frontend - recurso ${resourceType}:`, enhancedResult);

          mainWindow.webContents.send("resource-update", {
            fileId: fileId,
            resourceType: resourceType,
            result: enhancedResult,
            status: "completed",
            localPath: filePath,
          });
        }

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error(`Erro ao processar recurso ${resourceType}:`, error);

        // Enviar atualização de erro para o frontend
        if (mainWindow) {
          mainWindow.webContents.send("resource-update", {
            fileId: fileId,
            resourceType: resourceType,
            result: { error: error.message },
            status: "error",
          });
        }

        return { error: error.message };
      }
    }
  );

  /**
   * Handler para download de recursos quando o usuário clica em um dos botões
   */
  ipcMain.on("download-resource", async (event, resourceUrl) => {
    try {
      await downloadResource(resourceUrl);
    } catch (error) {
      console.error("Erro ao baixar recurso:", error);

      // Se mainWindow existir, enviar uma notificação de erro
      if (mainWindow) {
        mainWindow.webContents.send("download-error", {
          error: error.message,
          resourceUrl: resourceUrl,
        });
      }
    }
  });

  console.log("Handlers de recursos configurados com sucesso");
}

module.exports = {
  setupResourceHandlers,
};
