const fs = require('fs-extra');
const path = require('path');
const PDFDocument = require('pdfkit-table');

/**
 * Gera documentação completa do projeto em formato PDF
 */
async function gerarDocumentacao() {
  try {
    // Diretório para salvar a documentação
    const docDir = path.join(__dirname, 'documentacao');
    await fs.ensureDir(docDir);
    
    // Caminho do arquivo PDF
    const pdfPath = path.join(docDir, 'guia-completo-do-projeto.pdf');
    
    // Criar documento PDF
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: 'Documentação - Construtor de Aulas Acessíveis',
        Author: 'Construtor de Aulas',
        Subject: 'Documentação Técnica',
        Keywords: 'documentação, acessibilidade, educação',
      }
    });
    
    // Stream para arquivo
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // Adicionar título
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text('Construtor de Aulas Acessíveis', { align: 'center' })
       .moveDown(0.5);
       
    doc.fontSize(14)
       .font('Helvetica')
       .text('Documentação Técnica Completa', { align: 'center' })
       .moveDown(2);
       
    // Seção 1: Visão Geral
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('1. Visão Geral')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('O Construtor de Aulas Acessíveis é uma aplicação Electron que permite listar arquivos do Google Drive e gerar versões acessíveis de documentos educacionais. A aplicação se integra com o n8n para processar e converter documentos em diferentes formatos como áudio, PDF, e questões com resumo.', { align: 'justify' })
       .moveDown(1);
       
    // Seção 2: Arquitetura do Sistema
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('2. Arquitetura do Sistema')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('A aplicação é construída com uma arquitetura modular, separando claramente as responsabilidades entre frontend e backend:', { align: 'justify' })
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Frontend:')
       .font('Helvetica')
       .text('- Interface HTML/CSS/JS\n- Renderização de pastas e arquivos\n- Exibição de status de processamento')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Backend:')
       .font('Helvetica')
       .text('- Services: Lógica de negócio para interagir com Drive, processamento de documentos\n- Handlers: Gerenciamento de eventos IPC\n- Utils: Funções utilitárias reutilizáveis')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Integração n8n:')
       .font('Helvetica')
       .text('- Workflows para processamento assíncrono\n- Conversão para áudio (usando APIs de TTS)\n- Geração de PDF (via aplicação local + upload)\n- Geração de questões e resumo (usando IA)')
       .moveDown(1);
       
    // Seção 3: Componentes Principais
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('3. Componentes Principais')
       .moveDown(0.5);
       
    // Tabela de componentes
    const componentsTable = {
      title: 'Componentes do Sistema',
      headers: ['Componente', 'Descrição'],
      rows: [
        ['main.js', 'Ponto de entrada, inicializa a aplicação Electron'],
        ['index.html', 'Interface principal do usuário'],
        ['services/*.js', 'Serviços para Drive, PDF, e processamento de documentos'],
        ['handlers/*.js', 'Handlers para processamento de eventos IPC'],
        ['config/app-config.js', 'Configurações centralizadas da aplicação'],
        ['workflows/*.json', 'Definições dos fluxos de trabalho do n8n']
      ],
    };
    
    await doc.table(componentsTable, { 
      width: 500,
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(10)
    });
    
    doc.moveDown(1);
    
    // Seção 4: Fluxo de Trabalho
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('4. Fluxo de Trabalho')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('1. Autenticação e listagem de pastas/arquivos do Google Drive\n2. Seleção de um arquivo para processamento\n3. Download do arquivo e extração de texto\n4. Processamento paralelo das diferentes versões acessíveis:\n   - Geração de áudio via API TTS (OpenAI)\n   - Geração local de PDF e upload para o Drive\n   - Geração de questões e resumo via IA (ChatGPT)\n5. Exibição dos recursos gerados para o usuário', { align: 'justify' })
       .moveDown(1);
       
    // Seção 5: Configuração
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('5. Configuração')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('Para executar a aplicação em um novo ambiente:', { align: 'justify' })
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('1. Clone o repositório\n2. Execute "npm install" para instalar dependências\n3. Configure as credenciais do Google Drive no arquivo de configuração\n4. Configure os endpoints dos webhooks para o n8n\n5. Inicie a aplicação com "npm start"\n6. Inicie o servidor n8n e importe os workflows', { align: 'justify' })
       .moveDown(1);
       
    // Seção 6: Webhook API
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('6. Webhook API')
       .moveDown(0.5);
       
    // Tabela de endpoints
    const endpointsTable = {
      title: 'Endpoints de Webhook',
      headers: ['Endpoint', 'Método', 'Descrição'],
      rows: [
        ['/webhook/gerar-audio', 'POST', 'Gera arquivo de áudio a partir do texto extraído'],
        ['/webhook/upload-pdf', 'POST', 'Recebe um PDF gerado localmente e faz upload para o Drive'],
        ['/webhook/gerar-questoes', 'POST', 'Gera questões e resumo usando IA']
      ],
    };
    
    await doc.table(endpointsTable, { 
      width: 500,
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(10)
    });
    
    doc.moveDown(1);
    
    // Seção 7: Suporte e Resolução de Problemas
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('7. Suporte e Resolução de Problemas')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica')
       .text('Problemas comuns e soluções:', { align: 'justify' })
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Erro de autenticação com Google Drive:')
       .font('Helvetica')
       .text('Verifique se o arquivo de credenciais está atualizado e se as permissões adequadas estão ativadas no Console do Google.')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Falha na conexão com n8n:')
       .font('Helvetica')
       .text('Verifique se o servidor n8n está em execução e se os webhooks estão corretamente configurados e acessíveis.')
       .moveDown(0.5);
       
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Erro na extração de texto:')
       .font('Helvetica')
       .text('Verifique o formato do documento. A aplicação suporta .docx e Google Docs.')
       .moveDown(1);
       
    // Rodapé
    doc.fontSize(10)
       .font('Helvetica-Oblique')
       .text(`Documentação gerada em ${new Date().toLocaleString('pt-BR')}`, { align: 'center' })
       .moveDown(0.5);
       
    doc.fontSize(10)
       .font('Helvetica-Oblique')
       .text('© 2024 Construtor de Aulas Acessíveis', { align: 'center' });
    
    // Finalizar o documento
    doc.end();
    
    console.log(`Documentação gerada com sucesso em: ${pdfPath}`);
    return pdfPath;
  } catch (error) {
    console.error('Erro ao gerar documentação:', error);
    throw error;
  }
}

// Executar a função se este arquivo for executado diretamente
if (require.main === module) {
  gerarDocumentacao().catch(console.error);
}

module.exports = {
  gerarDocumentacao
};