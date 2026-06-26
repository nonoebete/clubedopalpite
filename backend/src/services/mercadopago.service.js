// src/services/mercadopago.service.js
// Integração PIX Dinâmico · Mercado Pago API v1
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/integrate-with-pix

const https = require('https');

const MP_BASE_URL = 'https://api.mercadopago.com';

// ── Utilitário: fetch sem dependências externas ────────────────
function mpRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.mercadopago.com',
      path,
      method,
      headers: {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   'application/json',
        'X-Idempotency-Key': `cdp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject({ status: res.statusCode, body: parsed });
          else resolve(parsed);
        } catch {
          reject({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ────────────────────────────────────────────────────────────────
//  CRIAR COBRANÇA PIX DINÂMICA
//  Retorna: { id, qrCode, qrCodeBase64, pixCopiaECola, expiresAt }
// ────────────────────────────────────────────────────────────────
async function criarCobrancaPix({
  valor,           // number — ex: 10.00
  descricao,       // string — ex: "Palpite 1ª Fase · CDP15"
  pagadorNome,     // string
  pagadorEmail,    // string
  pagadorCpf,      // string — somente números
  referenciaExterna, // string — ex: "palpite_123" (seu ID interno)
  expiracaoMinutos = 30,
}) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN não configurado.');

  const body = {
    transaction_amount: Number(valor),
    description:        descricao,
    payment_method_id:  'pix',
    payer: {
      first_name: pagadorNome.split(' ')[0],
      last_name:  pagadorNome.split(' ').slice(1).join(' ') || '-',
      email:      pagadorEmail,
      ...(pagadorCpf && pagadorCpf.replace(/\D/g,'') && pagadorCpf.replace(/\D/g,'') !== '00000000000' ? {
        identification: { type: 'CPF', number: pagadorCpf.replace(/\D/g, '') }
      } : {}),
    },
    external_reference: referenciaExterna,
    date_of_expiration: new Date(
      Date.now() + expiracaoMinutos * 60 * 1000
    ).toISOString(),
    notification_url: `${process.env.APP_URL}/api/pagamentos/webhook`,
  };

  const resposta = await mpRequest('POST', '/v1/payments', body, accessToken);

  const pix = resposta.point_of_interaction?.transaction_data;
  if (!pix) throw new Error('Mercado Pago não retornou dados PIX.');

  return {
    mpPaymentId:   resposta.id,
    status:        resposta.status,            // pending | approved | rejected
    qrCode:        pix.qr_code,               // texto "copia e cola"
    qrCodeBase64:  pix.qr_code_base64,        // imagem PNG em base64
    pixCopiaECola: pix.qr_code,
    expiresAt:     body.date_of_expiration,
    valor,
  };
}

// ────────────────────────────────────────────────────────────────
//  CONSULTAR STATUS DE UM PAGAMENTO
// ────────────────────────────────────────────────────────────────
async function consultarPagamento(mpPaymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  const resposta = await mpRequest('GET', `/v1/payments/${mpPaymentId}`, null, accessToken);
  return {
    mpPaymentId:  resposta.id,
    status:       resposta.status,          // pending | approved | cancelled | rejected
    statusDetail: resposta.status_detail,
    valor:        resposta.transaction_amount,
    pagoEm:       resposta.date_approved,
    referencia:   resposta.external_reference,
  };
}

// ────────────────────────────────────────────────────────────────
//  CANCELAR COBRANÇA (expirada ou abandonada)
// ────────────────────────────────────────────────────────────────
async function cancelarPagamento(mpPaymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  return mpRequest(
    'PUT',
    `/v1/payments/${mpPaymentId}`,
    { status: 'cancelled' },
    accessToken
  );
}

module.exports = { criarCobrancaPix, consultarPagamento, cancelarPagamento };
