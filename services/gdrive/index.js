const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const os = require("os");
const stream = require("stream");
const { promisify } = require("util");
const mammoth = require("mammoth");
const { ROOT_FOLDER_ID } = require("../../config/app-config");

// Caminho para o arquivo de credenciais da conta de serviço
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "../../service-account.json");

// Cliente do Google Drive
let driveClient = null;

/**
 * Inicializa a API do Google Drive
 */
async function initDrive() {
  try {
    // Verifica se as credenciais da conta de serviço existem
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.error(
        "Arquivo de credenciais da conta de serviço não encontrado:",
        SERVICE_ACCOUNT_PATH
      );
      return false;
    }

    // Lê as credenciais da conta de serviço
    const credentials = JSON.parse(
      fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
    );

    // Configura o cliente com a conta de serviço
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    // Inicializa o cliente do Drive
    driveClient = google.drive({ version: "v3", auth });

    // Testa a conexão verificando se consegue acessar a pasta raiz
    try {
      const response = await driveClient.files.get({
        fileId: ROOT_FOLDER_ID,
        fields: "id, name, mimeType",
      });

      if (response.status === 200) {
        console.log(
          "Cliente do Drive inicializado e pasta raiz acessada com sucesso:",
          response.data.name
        );
        return true;
      }
    } catch (error) {
      console.error("Erro ao acessar pasta raiz:", error.message);
      return false;
    }
  } catch (error) {
    console.error("Erro ao inicializar o Drive:", error.message);
    if (error.response) {
      console.error("Detalhes do erro:", error.response.data);
    }
    return false;
  }
}

/**
 * Lista pastas do Google Drive
 * @param {string} parentId - ID da pasta pai (opcional)
 * @returns {Promise<Array>} - Lista de pastas
 */
async function listFolders(parentId = null) {
  try {
    if (!driveClient) {
      throw new Error("Cliente do Drive não inicializado");
    }

    // Se não foi especificado um parentId, usa o ROOT_FOLDER_ID
    const effectiveParentId = parentId || ROOT_FOLDER_ID;

    let query =
      "mimeType='application/vnd.google-apps.folder' and trashed=false";
    query += ` and '${effectiveParentId}' in parents`;

    console.log("Executando query para listar pastas:", query);

    const response = await driveClient.files.list({
      q: query,
      fields: "files(id, name, parents)",
      orderBy: "name",
      pageSize: 1000,
    });

    console.log(`Encontradas ${response.data.files.length} pastas`);
    return response.data.files;
  } catch (error) {
    console.error("Erro ao listar pastas:", error.message);
    if (error.response) {
      console.error("Detalhes do erro:", error.response.data);
    }
    throw error;
  }
}

/**
 * Lista arquivos do Google Drive
 * @param {string} folderId - ID da pasta (opcional)
 * @returns {Promise<Array>} - Lista de arquivos
 */
async function listFiles(folderId = null) {
  try {
    if (!driveClient) {
      throw new Error("Cliente do Drive não inicializado");
    }

    // Se não foi especificado um folderId, usa o ROOT_FOLDER_ID
    const effectiveFolderId = folderId || ROOT_FOLDER_ID;

    let query =
      "mimeType!='application/vnd.google-apps.folder' and trashed=false";
    query += ` and '${effectiveFolderId}' in parents`;

    console.log("Executando query para listar arquivos:", query);

    const response = await driveClient.files.list({
      q: query,
      fields: "files(id, name, mimeType, createdTime)",
      orderBy: "name",
      pageSize: 1000,
    });

    console.log(`Encontrados ${response.data.files.length} arquivos`);
    return response.data.files;
  } catch (error) {
    console.error("Erro ao listar arquivos:", error.message);
    if (error.response) {
      console.error("Detalhes do erro:", error.response.data);
    }
    throw error;
  }
}

/**
 * Obtém o conteúdo de um arquivo do Google Drive
 * @param {string} fileId - ID do arquivo
 * @returns {Promise<Object>} - Conteúdo do arquivo
 */
async function getFileContent(fileId) {
  try {
    if (!driveClient) {
      return {
        error:
          "Cliente do Drive não inicializado. Impossível obter conteúdo do arquivo.",
      };
    }

    // Obtém informações sobre o arquivo
    const fileMetadata = await driveClient.files.get({
      fileId,
      fields: "name,mimeType",
    });

    const { name, mimeType } = fileMetadata.data;
    console.log("Obtendo arquivo:", name, "Tipo:", mimeType);

    let content;
    let rawContent;

    // Se for um Google Doc, exportar como DOCX
    if (mimeType === "application/vnd.google-apps.document") {
      console.log("Exportando Google Doc como DOCX...");
      const response = await driveClient.files.export(
        {
          fileId,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
          responseType: "arraybuffer",
        }
      );
      rawContent = response.data;
    }
    // Se for DOCX, baixar diretamente
    else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      console.log("Baixando arquivo DOCX...");
      const response = await driveClient.files.get(
        {
          fileId,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        }
      );
      rawContent = response.data;
    } else {
      return {
        error: `Tipo de arquivo não suportado: ${mimeType}. Apenas documentos Word (.docx) e Google Docs são suportados.`,
      };
    }

    // Converter DOCX para texto usando mammoth
    try {
      console.log("Convertendo DOCX para texto...");
      const result = await mammoth.extractRawText({ buffer: rawContent });
      content = result.value;

      // Log de diagnóstico
      console.log("Conversão concluída. Primeiros 200 caracteres:");
      console.log(content.substring(0, 200));

      if (result.messages.length > 0) {
        console.log("Mensagens da conversão:", result.messages);
      }
    } catch (convError) {
      console.error("Erro na conversão do documento:", convError);
      return { error: "Erro ao converter o documento para texto." };
    }

    return {
      name,
      mimeType,
      content,
      rawContent: Buffer.from(rawContent).toString("base64"),
      isBase64: true,
    };
  } catch (error) {
    console.error("Erro ao obter conteúdo do arquivo:", error);
    return { error: error.message };
  }
}

/**
 * Baixa um arquivo do Google Drive
 * @param {string} fileId - ID do arquivo
 * @param {string} destPath - Caminho de destino (opcional)
 * @returns {Promise<string>} - Caminho do arquivo baixado
 */
async function downloadFile(fileId, destPath = null) {
  try {
    if (!driveClient) {
      throw new Error(
        "Cliente do Drive não inicializado. Impossível baixar arquivo."
      );
    }

    // Obtém informações sobre o arquivo
    const fileMetadata = await driveClient.files.get({
      fileId,
      fields: "name",
    });

    const { name } = fileMetadata.data;

    // Define o caminho de destino
    const finalDestPath = destPath || path.join(os.tmpdir(), name);

    // Cria um stream de escrita
    const dest = fs.createWriteStream(finalDestPath);

    // Baixa o arquivo
    const response = await driveClient.files.get(
      {
        fileId,
        alt: "media",
      },
      { responseType: "stream" }
    );

    // Pipe a stream de resposta para o arquivo
    response.data.pipe(dest);

    // Espera o download concluir
    await new Promise((resolve, reject) => {
      dest.on("finish", resolve);
      dest.on("error", reject);
    });

    return finalDestPath;
  } catch (error) {
    console.error("Erro ao baixar arquivo:", error);
    throw error;
  }
}

module.exports = {
  initDrive,
  listFolders,
  listFiles,
  getFileContent,
  downloadFile,
};
