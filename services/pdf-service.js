const PDFDocument = require('pdfkit-table');
const fs = require('fs-extra');
const path = require('path');
const { downloadsPath } = require('../config/app-config');
const { generateTempFileName } = require('../utils/file-utils');

/**
 * Gera um arquivo PDF a partir do texto extraído
 * @param {string} textoExtraido - Texto extraído do documento
 * @param {string} fileName - Nome original do arquivo
 * @param {string} fileId - ID do arquivo no Google Drive
 * @returns {Promise<Object>} - Informações sobre o PDF gerado
 */
async function gerarPDF(textoExtraido, fileName, fileId) {
  try {
    // Criar nome de arquivo único para o PDF
    const timestamp = Date.now();
    const pdfFileName = `${fileId}_${timestamp}.pdf`;
    const pdfFilePath = path.join(downloadsPath, pdfFileName);

    // Garantir que a pasta existe
    await fs.ensureDir(downloadsPath);

    // Inicializar documento PDF
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: fileName,
        Author: 'Construtor de Aulas',
        Subject: 'Material Acessível',
        Keywords: 'acessibilidade, educação, inclusão',
      }
    });

    // Stream do PDF para arquivo
    const stream = fs.createWriteStream(pdfFilePath);
    doc.pipe(stream);

    // Adicionar título
    doc.fontSize(24)
      .font('Helvetica-Bold')
      .text(fileName.replace(/\.[^/.]+$/, ''), { // Remover extensão
        align: 'center'
      })
      .moveDown(2);

    // Adicionar texto principal com formatação básica
    doc.fontSize(12)
      .font('Helvetica')
      .text(textoExtraido, {
        align: 'justify',
        lineGap: 5
      });

    // Adicionar rodapé com data de geração
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      
      // Adiciona o rodapé na parte inferior da página
      const footerY = doc.page.height - 50;
      doc.fontSize(8)
         .text(
           `Gerado em ${new Date().toLocaleString('pt-BR')} | Página ${i + 1} de ${pageCount}`,
           50,
           footerY,
           { align: 'center', width: doc.page.width - 100 }
         );
    }

    // Finalizar o documento
    doc.end();

    // Aguardar a conclusão da escrita no arquivo
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({
          filePath: pdfFilePath,
          fileName: pdfFileName,
          status: 'completed'
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}

module.exports = {
  gerarPDF
};