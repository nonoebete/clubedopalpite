// src/controllers/whatsapp.controller.js
// Endpoints para o admin gerenciar a instância WhatsApp

const wpp   = require('../services/whatsapp.service');
const notif = require('../services/notificacao.service');

// GET /api/whatsapp/status
async function status(req, res) {
  const estado = await wpp.statusInstancia();
  return res.json({
    instancia: process.env.EVOLUTION_INSTANCE || 'clube-palpite',
    estado,
    conectado: estado?.instance?.state === 'open',
  });
}

// GET /api/whatsapp/qrcode — obtém QR Code para conectar o WhatsApp
async function qrcode(req, res) {
  try {
    const data = await wpp.obterQrCode();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao obter QR Code.', detalhe: err?.body || err.message });
  }
}

// POST /api/whatsapp/testar — envia mensagem de teste
// Body: { telefone, mensagem? }
async function testar(req, res) {
  const { telefone, mensagem } = req.body;
  if (!telefone) return res.status(400).json({ error: 'Informe o telefone.' });

  const msg = mensagem || `✅ *Teste — Clube de Palpites*\n\nSeu WhatsApp está conectado corretamente!\n\n_${new Date().toLocaleString('pt-BR')}_`;
  const result = await wpp.enviarMensagem(telefone, msg);

  return res.json(result.ok
    ? { sucesso: true, para: result.numero }
    : { sucesso: false, erro: result.erro }
  );
}

// POST /api/whatsapp/notificar-fase — disparo manual de lembrete
// Body: { campanhaId, tipo: 'abrindo' | 'encerrando' }
async function notificarFaseManual(req, res) {
  const { campanhaId, tipo } = req.body;
  if (!campanhaId || !tipo) return res.status(400).json({ error: 'Informe campanhaId e tipo.' });
  if (!['abrindo', 'encerrando'].includes(tipo)) return res.status(400).json({ error: 'tipo deve ser "abrindo" ou "encerrando".' });

  // Dispara em background
  notif.notificarFase(Number(campanhaId), tipo).catch(console.error);

  return res.json({ mensagem: `Lembrete "${tipo}" disparado em background para todos os membros.` });
}

module.exports = { status, qrcode, testar, notificarFaseManual };
