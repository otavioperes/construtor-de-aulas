const { processarAula, createZipFromHTMLs } = require("./processor-service");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

/**
 * Processa um documento e gera os HTMLs correspondentes
 * @param {string} fileContent - Conteúdo do arquivo a ser processado
 * @returns {Promise<Object>} - Resultado do processamento
 */
async function processDocument(fileContent) {
  try {
    const result = processarAula(fileContent);

    if (result.error) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Gerar uma pasta temporária para os arquivos gerados
    const tempDir = path.join(os.tmpdir(), `html-gen-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Salvar os HTMLs em arquivos temporários
    const htmlPaths = await Promise.all(
      result.htmls.map(async (html, index) => {
        const htmlPath = path.join(tempDir, `topico_${index + 1}.html`);
        await fs.writeFile(htmlPath, html);
        return htmlPath;
      })
    );

    // Criar arquivo zip com os HTMLs
    const zipPath = path.join(tempDir, "aula.zip");
    await createZipFromHTMLs(result.htmls, zipPath);

    return {
      success: true,
      htmls: result.htmls,
      htmlPaths,
      zipPath,
      tempDir,
    };
  } catch (error) {
    console.error("Erro ao processar documento:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Processa um documento do Google Drive e gera os HTMLs
 * @param {string} fileId - ID do arquivo no Google Drive
 * @param {string} fileContent - Conteúdo do arquivo a ser processado
 * @returns {Promise<Object>} - Resultado do processamento
 */
async function processDriveDocument(fileId, fileContent) {
  try {
    // Processa o documento
    const result = await processDocument(fileContent);

    if (!result.success) {
      return result;
    }

    // Adiciona o fileId ao resultado para referência
    return {
      ...result,
      fileId,
    };
  } catch (error) {
    console.error("Erro ao processar documento do Drive:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Limpa os arquivos temporários gerados pelo processamento
 * @param {string} tempDir - Diretório temporário a ser limpo
 */
async function cleanupTempFiles(tempDir) {
  try {
    if (tempDir && (await fs.pathExists(tempDir))) {
      await fs.remove(tempDir);
      console.log(`Diretório temporário removido: ${tempDir}`);
    }
  } catch (error) {
    console.error("Erro ao limpar arquivos temporários:", error);
  }
}

module.exports = {
  processDocument,
  processDriveDocument,
  cleanupTempFiles,
};
