// src/controllers/whatsapp.controller.js
// Endpoints para o admin gerenciar a instância WhatsApp

const wpp   = require('../services/whatsapp.service');
const notif = require('../services/notificacao.service');

// Armazena o QR Code em memória
let qrCodeCache = null;

// POST /api/whatsapp/qrcode-webhook — recebe QR Code do Evolution (público)
async function qrcodeWebhook(req, res) {
  try {
    const body = req.body;
    if (body?.event === 'qrcode.updated' && body?.data?.qrcode?.base64) {
      qrCodeCache = {
        base64: body.data.qrcode.base64,
        timestamp: new Date().toISOString(),
      };
      console.log('[WPP] QR Code recebido via webhook às', qrCodeCache.timestamp);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// GET /api/whatsapp/qrcode-show — exibe QR Code em HTML (admin)
async function qrcodeShow(req, res) {
  if (!qrCodeCache) {
    return res.send(`<html><body style="background:#0b1c35;color:#dce8f5;font-family:sans-serif;text-align:center;padding:40px">
      <h2>QR Code não disponível ainda</h2>
      <p>Aguarde o Evolution gerar o QR Code...</p>
      <button onclick="location.reload()" style="background:#F0A500;border:none;padding:12px 24px;border-radius:8px;font-size:16px;cursor:pointer;margin-top:16px">🔄 Atualizar</button>
      <script>setTimeout(()=>location.reload(),5000)</script>
    </body></html>`);
  }
  const b64 = qrCodeCache.base64.replace(/^data:image\/\w+;base64,/, '');
  return res.send(`<html><body style="background:#0b1c35;color:#dce8f5;font-family:sans-serif;text-align:center;padding:40px">
    <h2>📱 Escaneie com o WhatsApp</h2>
    <p style="color:#7a93ad">Gerado em: ${qrCodeCache.timestamp}</p>
    <img src="data:image/png;base64,${b64}" style="border:8px solid white;border-radius:12px;margin:20px auto;display:block;max-width:300px">
    <p style="color:#7a93ad;margin-top:16px">Abra WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
    <button onclick="location.reload()" style="background:#F0A500;border:none;padding:12px 24px;border-radius:8px;font-size:16px;cursor:pointer;margin-top:16px">🔄 Atualizar</button>
    <script>setTimeout(()=>location.reload(),10000)</script>
  </body></html>`);
}

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

module.exports = { status, qrcode, qrcodeWebhook, qrcodeShow, testar, notificarFaseManual };
