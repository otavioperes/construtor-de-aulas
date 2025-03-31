const path = require("path");
const os = require("os");

// Caminho da pasta de downloads
const downloadsPath = path.join(os.homedir(), "Downloads", "ConstrutorDeAulas");

// ID da pasta raiz no Google Drive
const ROOT_FOLDER_ID = "11ihE_KnUKKCVBIaX7UhDzH8py36HsS3F";

// URLs dos webhooks para cada tipo de recurso
const webhookUrls = {
  audio: "http://localhost:5678/webhook/gerar-audio", // Correção: use o formato padrão /webhook/X
  pdf: "http://localhost:5678/webhook/upload-pdf", // Endpoint para upload do PDF
  questoes: "http://localhost:5678/webhook/gerar-questoes", // Endpoint para geração de conteúdo
  uploadQuestoes: "http://localhost:5678/webhook/upload-questoes", // Endpoint para upload do DOCX
};

// Inicialização de configurações
function initConfig() {
  console.log("Inicializando configurações da aplicação...");
  return {
    downloadsPath,
    ROOT_FOLDER_ID,
    webhookUrls,
  };
}

module.exports = {
  downloadsPath,
  ROOT_FOLDER_ID,
  webhookUrls,
  initConfig,
};
