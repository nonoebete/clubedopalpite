// src/services/whatsapp.service.js
// Integração com Evolution API (self-hosted)
// Docs: https://doc.evolution-api.com

const https = require('https');
const http  = require('http');

const EVO_URL      = process.env.EVOLUTION_API_URL   || 'http://localhost:8080';
const EVO_KEY      = process.env.EVOLUTION_API_KEY   || '';
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE  || 'clube-palpite';

// ── Utilitário HTTP sem dependências externas ─────────────────
function evoRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(EVO_URL + path);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey':       EVO_KEY,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject({ status: res.statusCode, body: parsed });
          else resolve(parsed);
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Formata telefone para padrão WhatsApp (5548999990000) ─────
function formatarTelefone(tel) {
  const nums = tel.replace(/\D/g, '');
  // Já tem DDI
  if (nums.startsWith('55') && nums.length >= 12) return nums;
  // Adiciona DDI Brasil
  return '55' + nums;
}

// ═════════════════════════════════════════════════════════════
//  FUNÇÃO PRINCIPAL: enviar mensagem de texto
// ═════════════════════════════════════════════════════════════
async function enviarMensagem(telefone, mensagem) {
  const numero = formatarTelefone(telefone);
  try {
    const resp = await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, {
      number:      numero,
      textMessage: { text: mensagem },
    });
    console.log(`[WPP] ✅ Enviado para ${numero}`);
    return { ok: true, numero, resp };
  } catch (err) {
    console.error(`[WPP] ❌ Falha ao enviar para ${numero}:`, err?.body || err.message);
    return { ok: false, numero, erro: err?.body || err.message };
  }
}

// ── Verifica status da instância ──────────────────────────────
async function statusInstancia() {
  try {
    const resp = await evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
    return resp;
  } catch (err) {
    return { state: 'error', erro: err?.body || err.message };
  }
}

// ── Obtém QR Code para conectar o WhatsApp ───────────────────
async function obterQrCode() {
  return evoRequest('GET', `/instance/connect/${EVO_INSTANCE}`);
}

module.exports = { enviarMensagem, statusInstancia, obterQrCode, formatarTelefone };
