const fs = require('fs-extra');
const path = require('path');
const { downloadsPath } = require('../config/app-config');
const { generateTempFileName } = require('../utils/file-utils');
const officegen = require('officegen');

/**
 * Gera um arquivo DOCX a partir do conteúdo de questões e resumo
 * @param {string} conteudo - Texto com questões e resumo gerado pela IA
 * @param {string} fileName - Nome original do arquivo
 * @param {string} fileId - ID do arquivo no Google Drive
 * @returns {Promise<Object>} - Informações sobre o DOCX gerado
 */
async function gerarDocxQuestoes(conteudo, fileName, fileId) {
  try {
    // Criar nome de arquivo único para o DOCX
    const timestamp = Date.now();
    const docxFileName = `${fileId}_questoes_${timestamp}.docx`;
    const docxFilePath = path.join(downloadsPath, docxFileName);

    // Garantir que a pasta existe
    await fs.ensureDir(downloadsPath);

    // Criar um novo documento Word
    const docx = officegen('docx');
    
    // Configurar metadados do documento
    docx.creator = 'Construtor de Aulas';
    docx.title = `Questões e Resumo: ${fileName}`;
    docx.subject = 'Material Acessível';
    docx.keywords = 'educação, acessibilidade, resumo, questões';

    // Adicionar um título
    const pTitle = docx.createP();
    pTitle.addText(`Questões e Resumo: ${fileName.replace('.docx', '')}`, { 
      bold: true, 
      font_size: 14,
      font_face: 'Calibri'
    });

    // Adicionar quebra de linha depois do título
    docx.createP();

    // Verificar se temos conteúdo para processar
    if (!conteudo || conteudo.trim() === '') {
      console.error('Conteúdo vazio recebido para geração do DOCX');
      const pError = docx.createP();
      pError.addText('Erro: Não foi possível gerar o conteúdo.', { 
        color: 'FF0000',
        bold: true 
      });
      const pErrorDetails = docx.createP();
      pErrorDetails.addText('O sistema não recebeu conteúdo válido do serviço de IA. Por favor, tente novamente mais tarde.');
      
      // Vamos continuar o processamento para criar o arquivo mesmo com erro
    } else {
      console.log(`Processando conteúdo com ${conteudo.length} caracteres`);
      
      // Dividir o conteúdo em parágrafos
      const paragraphs = conteudo.split('\n\n');
      console.log(`Conteúdo dividido em ${paragraphs.length} parágrafos`);
  
      // Adicionar cada parágrafo ao documento
      paragraphs.forEach((paragraph, index) => {
        if (paragraph.trim()) {
          const p = docx.createP();
          
          // Verificar se é um título (começa com ## ou #)
          if (paragraph.trim().startsWith('##')) {
            p.addText(paragraph.replace(/^##\s*/, ''), { 
              bold: true, 
              font_size: 13,
              font_face: 'Calibri' 
            });
            console.log(`Parágrafo ${index}: Formatado como título`);
          } 
          // Verificar se é um marcador de lista (começa com - ou *)
          else if (paragraph.trim().startsWith('-') || paragraph.trim().startsWith('*')) {
            p.addText(paragraph, { bullet: true });
            console.log(`Parágrafo ${index}: Formatado como item de lista`);
          }
          // Verificar se é uma questão numerada (começa com número seguido de ponto)
          else if (/^\d+\./.test(paragraph.trim())) {
            p.addText(paragraph, { 
              font_face: 'Calibri',
              font_size: 11
            });
            console.log(`Parágrafo ${index}: Formatado como questão numerada`);
          }
          // Texto normal
          else {
            p.addText(paragraph);
            console.log(`Parágrafo ${index}: Formatado como texto normal`);
          }
        }
      });
    }

    // Criar o arquivo DOCX
    const stream = fs.createWriteStream(docxFilePath);

    // Aguardar a conclusão da escrita no arquivo
    return new Promise((resolve, reject) => {
      // Evento de erro no stream
      stream.on('error', reject);
      
      // Quando o arquivo for finalizado
      docx.on('finalize', () => {
        console.log(`Arquivo DOCX gerado em: ${docxFilePath}`);
      });
      
      // Quando encontrar um erro
      docx.on('error', (err) => {
        console.error('Erro ao gerar DOCX:', err);
        reject(err);
      });
      
      // Finalizar geração
      docx.generate(stream);
      
      // Quando o stream for fechado (finalizado)
      stream.on('close', () => {
        resolve({
          filePath: docxFilePath,
          fileName: docxFileName,
          status: 'completed'
        });
      });
    });
  } catch (error) {
    console.error('Erro ao gerar DOCX:', error);
    throw error;
  }
}

module.exports = {
  gerarDocxQuestoes
};