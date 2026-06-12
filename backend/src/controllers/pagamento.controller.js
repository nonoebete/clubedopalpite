// src/controllers/pagamento.controller.js
// Fluxo completo: registrar palpites → gerar PIX → webhook → confirmar

const prisma = require('../models/prisma');
const mp     = require('../services/mercadopago.service');
const crypto = require('crypto');

// ────────────────────────────────────────────────────────────────
//  POST /api/pagamentos/iniciar
//  Body: { campanhaId, palpites: [{selecaoCampeaId, selecaoViceId?}] }
//
//  Fluxo:
//  1. Valida campanha ativa
//  2. Cria os palpites com status pagamento_confirmado=false
//  3. Cria cobrança PIX no Mercado Pago
//  4. Salva Pagamento no banco com qr_code
//  5. Retorna QR Code + copia-e-cola para o frontend exibir
// ────────────────────────────────────────────────────────────────
async function iniciarPagamento(req, res) {
  const { campanhaId, palpites } = req.body;
  const usuarioId = req.user.id;

  if (!campanhaId || !Array.isArray(palpites) || !palpites.length) {
    return res.status(400).json({ error: 'Informe campanhaId e ao menos um palpite.' });
  }

  try {
    // 1. Busca campanha e usuário
    const [campanha, usuario] = await Promise.all([
      prisma.campanha.findUnique({ where: { id: Number(campanhaId) } }),
      prisma.usuario.findUnique({ where: { id: usuarioId } }),
    ]);

    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const agora = new Date();
    if (!campanha.ativa || agora < campanha.inicio || agora > campanha.fim) {
      return res.status(400).json({ error: 'Campanha não está aberta para novos palpites.' });
    }

    // Validações específicas por fase
    for (const p of palpites) {
      if (!p.selecaoCampeaId) return res.status(400).json({ error: 'selecaoCampeaId obrigatório.' });
      if (campanha.tipo === 'CAMPEA_VICE') {
        if (!p.selecaoViceId) return res.status(400).json({ error: 'selecaoViceId obrigatório na 2ª fase.' });
        if (p.selecaoCampeaId === p.selecaoViceId) return res.status(400).json({ error: 'Campeã e vice não podem ser iguais.' });
      }
    }

    const valorUnitario  = Number(campanha.valorPalpite);
    const valorTotal     = valorUnitario * palpites.length;

    // 2. Cria os palpites como PENDENTES (pagamento_confirmado=false)
    const palpitesCriados = await prisma.$transaction(
      palpites.map(p =>
        prisma.palpiteCampanha.create({
          data: {
            usuarioId,
            campanhaId:          campanha.id,
            selecaoCampeaId:     Number(p.selecaoCampeaId),
            selecaoViceId:       p.selecaoViceId ? Number(p.selecaoViceId) : null,
            valorPago:           valorUnitario,
            pagamentoConfirmado: false,
          },
        })
      )
    );

    const palpiteIds = palpitesCriados.map(p => p.id);

    // 3. Gera cobrança PIX no Mercado Pago
    const descricao = `${campanha.nome} · ${usuario.apelido} (${usuario.codigoCdp}) · ${palpites.length} palpite(s)`;

    const pixData = await mp.criarCobrancaPix({
      valor:             valorTotal,
      descricao,
      pagadorNome:       usuario.nomeCompleto,
      pagadorEmail:      usuario.email || `${usuario.codigoCdp.toLowerCase()}@clubedopalpite.com`,
      pagadorCpf:        usuario.cpf   || '00000000000', // idealmente coletado no cadastro
      referenciaExterna: `palpite_${palpiteIds.join('_')}`,
      expiracaoMinutos:  30,
    });

    // 4. Salva registro do pagamento no banco
    const pagamento = await prisma.pagamento.create({
      data: {
        usuarioId,
        campanhaId:   campanha.id,
        palpiteIds:   JSON.stringify(palpiteIds),
        mpPaymentId:  String(pixData.mpPaymentId),
        qrCode:       pixData.qrCode,
        qrCodeBase64: pixData.qrCodeBase64,
        pixCopiaECola: pixData.pixCopiaECola,
        valor:        valorTotal,
        status:       'PENDENTE',
        expiresAt:    new Date(pixData.expiresAt),
      },
    });

    // 5. Retorna para o frontend exibir o QR Code
    return res.status(201).json({
      pagamentoId:   pagamento.id,
      mpPaymentId:   pixData.mpPaymentId,
      valor:         `R$ ${valorTotal.toFixed(2)}`,
      quantPalpites: palpites.length,
      pix: {
        qrCodeBase64:  pixData.qrCodeBase64,  // imagem PNG base64 para exibir
        copiaECola:    pixData.pixCopiaECola, // texto para o botão "Copiar"
        expiracao:     pixData.expiresAt,
        expiracaoMin:  30,
      },
      instrucoes: 'Abra seu banco, vá em PIX e escaneie o QR Code ou use o código copia e cola. O pagamento expira em 30 minutos.',
    });

  } catch (err) {
    console.error('[PIX] Erro ao iniciar pagamento:', err);
    return res.status(500).json({ error: 'Erro ao gerar cobrança PIX. Tente novamente.' });
  }
}

// ────────────────────────────────────────────────────────────────
//  POST /api/pagamentos/webhook
//  Recebe notificações automáticas do Mercado Pago
//  Confirma ou rejeita pagamentos automaticamente
// ────────────────────────────────────────────────────────────────
async function webhook(req, res) {
  try {
    // Validação da assinatura do Mercado Pago (segurança)
    const assinatura = req.headers['x-signature']         || '';
    const requestId  = req.headers['x-request-id']       || '';
    const secret     = process.env.MP_WEBHOOK_SECRET      || '';

    if (secret && !validarAssinaturaMP(assinatura, requestId, req.body, secret)) {
      console.warn('[WEBHOOK] Assinatura inválida recebida');
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    const { type, data } = req.body;

    // Só processa notificações de pagamento
    if (type !== 'payment') {
      return res.status(200).json({ recebido: true });
    }

    const mpPaymentId = data?.id;
    if (!mpPaymentId) return res.status(400).json({ error: 'ID do pagamento não informado.' });

    // Consulta o status real no Mercado Pago (não confia só no webhook)
    const statusMP = await mp.consultarPagamento(mpPaymentId);

    // Busca o pagamento local pelo ID do Mercado Pago
    const pagamento = await prisma.pagamento.findUnique({
      where: { mpPaymentId: String(mpPaymentId) },
    });

    if (!pagamento) {
      console.warn(`[WEBHOOK] Pagamento MP ${mpPaymentId} não encontrado localmente`);
      return res.status(200).json({ recebido: true }); // 200 para MP não retentar
    }

    // Já processado — idempotência
    if (pagamento.status === 'APROVADO') {
      return res.status(200).json({ recebido: true });
    }

    // Processa conforme status do MP
    if (statusMP.status === 'approved') {
      await confirmarPagamento(pagamento, statusMP.pagoEm);
    } else if (['cancelled', 'rejected', 'expired'].includes(statusMP.status)) {
      await rejeitarPagamento(pagamento, statusMP.status);
    }

    return res.status(200).json({ recebido: true });

  } catch (err) {
    console.error('[WEBHOOK] Erro:', err);
    // SEMPRE retorna 200 para o MP (evita re-tentativas infinitas)
    return res.status(200).json({ recebido: true, erro: 'interno' });
  }
}

// ────────────────────────────────────────────────────────────────
//  Confirma pagamento: atualiza pagamento + libera palpites
// ────────────────────────────────────────────────────────────────
async function confirmarPagamento(pagamento, pagoEm) {
  const palpiteIds = JSON.parse(pagamento.palpiteIds);

  await prisma.$transaction([
    // Marca pagamento como APROVADO
    prisma.pagamento.update({
      where: { id: pagamento.id },
      data: {
        status: 'APROVADO',
        pagoEm: pagoEm ? new Date(pagoEm) : new Date(),
      },
    }),
    // Libera todos os palpites vinculados
    prisma.palpiteCampanha.updateMany({
      where: { id: { in: palpiteIds } },
      data:  { pagamentoConfirmado: true },
    }),
  ]);

  console.log(`[PIX] ✅ Pagamento ${pagamento.id} aprovado. Palpites liberados: ${palpiteIds.join(', ')}`);
}

// ────────────────────────────────────────────────────────────────
//  Rejeita pagamento: remove palpites pendentes
// ────────────────────────────────────────────────────────────────
async function rejeitarPagamento(pagamento, motivo) {
  const palpiteIds = JSON.parse(pagamento.palpiteIds);
  const novoStatus = motivo === 'expired' ? 'EXPIRADO' : motivo === 'cancelled' ? 'CANCELADO' : 'REJEITADO';

  await prisma.$transaction([
    prisma.pagamento.update({
      where: { id: pagamento.id },
      data:  { status: novoStatus },
    }),
    // Remove palpites que não foram pagos
    prisma.palpiteCampanha.deleteMany({
      where: { id: { in: palpiteIds }, pagamentoConfirmado: false },
    }),
  ]);

  console.log(`[PIX] ❌ Pagamento ${pagamento.id} ${novoStatus}. Palpites removidos.`);
}

// ────────────────────────────────────────────────────────────────
//  GET /api/pagamentos/:id/status
//  Polling do frontend para saber se o PIX foi pago
// ────────────────────────────────────────────────────────────────
async function consultarStatus(req, res) {
  const { id } = req.params;
  try {
    const pagamento = await prisma.pagamento.findFirst({
      where: { id: Number(id), usuarioId: req.user.id },
      select: { id: true, status: true, valor: true, pagoEm: true, expiresAt: true, quantPalpites: true },
    });

  // Credita comissão de indicação (assíncrono, não bloqueia resposta)
  creditarComissaoPalpite(pagamento.usuarioId, Number(pagamento.valor))
    .catch(e => console.error('[IND] comissão:', e.message));

    if (!pagamento) return res.status(404).json({ error: 'Pagamento não encontrado.' });

    // Se ainda pendente, consulta o MP para garantir atualização
    if (pagamento.status === 'PENDENTE' && pagamento.expiresAt < new Date()) {
      await prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: 'EXPIRADO' } });
      pagamento.status = 'EXPIRADO';
    }

    return res.json({
      id:       pagamento.id,
      status:   pagamento.status,
      pago:     pagamento.status === 'APROVADO',
      valor:    `R$ ${Number(pagamento.valor).toFixed(2)}`,
      pagoEm:   pagamento.pagoEm,
      expiresAt: pagamento.expiresAt,
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao consultar status.' });
  }
}

// ────────────────────────────────────────────────────────────────
//  GET /api/pagamentos/meus
//  Histórico de pagamentos do usuário logado
// ────────────────────────────────────────────────────────────────
async function meusPagamentos(req, res) {
  try {
    const pagamentos = await prisma.pagamento.findMany({
      where:   { usuarioId: req.user.id },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true, valor: true, status: true,
        criadoEm: true, pagoEm: true, expiresAt: true,
        campanha: { select: { nome: true, fase: true } },
      },
    });
    return res.json(pagamentos);
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar pagamentos.' });
  }
}

// ────────────────────────────────────────────────────────────────
//  Validação de assinatura do Mercado Pago (segurança do webhook)
// ────────────────────────────────────────────────────────────────
function validarAssinaturaMP(assinatura, requestId, body, secret) {
  try {
    // Formato: ts=<timestamp>,v1=<hash>
    const parts = Object.fromEntries(assinatura.split(',').map(p => p.split('=')));
    const ts    = parts.ts;
    const v1    = parts.v1;
    const dataId = body?.data?.id || '';

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { iniciarPagamento, webhook, consultarStatus, meusPagamentos };
