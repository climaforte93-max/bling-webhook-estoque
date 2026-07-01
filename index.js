const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const WEBZAP_API_URL = process.env.WEBZAP_API_URL || '';
const WEBZAP_API_TOKEN = process.env.WEBZAP_API_TOKEN || '';
const WEBZAP_PHONE = process.env.WEBZAP_PHONE || '';
const NOTIFICAR_TELEFONE = process.env.NOTIFICAR_TELEFONE || '';
const DEFAULT_ESTOQUE_MINIMO = parseInt(process.env.DEFAULT_ESTOQUE_MINIMO || '5', 10);

function extrairDadosEstoque(payload) {
  const data = payload.data || payload;
  const produto = data.produto || data.nome || data.descricao || 'Produto desconhecido';
  const codigo = data.codigo || data.sku || '';
  const saldo = data.estoque ?? data.saldo ?? data.quantidade ?? null;
  const estoqueMinimo = data.estoqueMinimo ?? data.estoque_minimo ?? DEFAULT_ESTOQUE_MINIMO;

  return {
    produto: String(produto),
    codigo: String(codigo),
    saldo: saldo !== null ? Number(saldo) : null,
    estoqueMinimo: Number(estoqueMinimo),
  };
}

function formatarMensagem(dados) {
  return [
    '⚠️ *ALERTA DE ESTOQUE BAIXO*',
    '━━━━━━━━━━━━━━━━',
    `📦 *Produto:* ${dados.produto}`,
    dados.codigo ? `🔖 *Código:* ${dados.codigo}` : '',
    `📊 *Estoque atual:* ${dados.saldo}`,
    `📉 *Estoque mínimo:* ${dados.estoqueMinimo}`,
    '━━━━━━━━━━━━━━━━',
    `🕐 ${new Date().toLocaleString('pt-BR')}`,
    '_Notificação automática via Bling_',
  ]
    .filter(Boolean)
    .join('\n');
}

async function enviarWhatsApp(telefone, mensagem) {
  if (!WEBZAP_API_URL || !WEBZAP_API_TOKEN) {
    throw new Error('WebZap não configurado');
  }

  const numero = telefone.replace(/\D/g, '');
  const url = `${WEBZAP_API_URL}/message/sendText`;

  const response = await axios.post(
    url,
    { number: numero, text: mensagem },
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: WEBZAP_API_TOKEN,
      },
      timeout: 15000,
    }
  );

  return response.data;
}

app.post('/api/webhook/estoque', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ erro: 'Payload vazio' });
    }

    const dados = extrairDadosEstoque(payload);

    if (dados.saldo === null) {
      return res.status(200).json({ status: 'ignorado', motivo: 'saldo_indisponivel' });
    }

    if (dados.saldo > dados.estoqueMinimo) {
      return res.status(200).json({ status: 'ok', notificado: false });
    }

    const mensagem = formatarMensagem(dados);
    const telefone = NOTIFICAR_TELEFONE || WEBZAP_PHONE;

    await enviarWhatsApp(telefone, mensagem);

    return res.status(200).json({
      status: 'ok',
      notificado: true,
      produto: dados.produto,
      saldo: dados.saldo,
    });
  } catch (erro) {
    console.error('Erro:', erro.message);
    return res.status(200).json({ status: 'erro', notificado: false });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
module.exports.default = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}
