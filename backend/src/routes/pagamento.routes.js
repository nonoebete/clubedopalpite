// src/routes/pagamento.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/pagamento.controller');
const { autenticar } = require('../middleware/auth.middleware');

// Webhook do Mercado Pago — SEM autenticação JWT (chamado pelo MP)
router.post('/webhook', ctrl.webhook);

// Rotas autenticadas
router.post('/',                          autenticar, ctrl.iniciarPagamento);
router.get('/meus',                       autenticar, ctrl.meusPagamentos);
router.get('/:id/status',                 autenticar, ctrl.consultarStatus);
router.post('/:id/reenviar-whatsapp',     autenticar, ctrl.reenviarConfirmacao);
router.post('/:id/cancelar',              autenticar, ctrl.cancelarPagamento);

module.exports = router;

// Rota de depósito
router.post('/deposito', autenticar, async (req, res) => {
  const prisma = require('../models/prisma');
  const mp = require('../services/mercadopago.service');
  try {
    const usuarioId = req.user.id;
    const { valor } = req.body;
    if (!valor || valor < 10) return res.status(400).json({ error: 'Valor mínimo de R$ 10,00.' });
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    const pagamento = await prisma.pagamento.create({
      data: {
        usuarioId,
        campanhaId: 1,
        valor: Number(valor),
        status: 'PENDENTE',
        palpiteIds: '[]',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const pixData = await mp.criarCobrancaPix({
      valor: Number(valor),
      descricao: `Deposito Clube de Palpites · ${usuario.apelido} (${usuario.codigoCdp})`,
      pagadorNome: usuario.nomeCompleto,
      pagadorEmail: usuario.email || `${usuario.codigoCdp.toLowerCase()}@clubedopalpite.com`,
      pagadorCpf: usuario.cpf || '00000000000',
      referenciaExterna: `deposito_${pagamento.id}`,
      expiracaoMinutos: 30,
    });
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: {
        mpPaymentId: String(pixData.mpPaymentId),
        qrCode: pixData.qrCode,
        qrCodeBase64: pixData.qrCodeBase64,
        pixCopiaECola: pixData.pixCopiaECola,
        expiresAt: new Date(pixData.expiresAt),
      },
    });
    res.json({
      pagamentoId: pagamento.id,
      valor,
      pix: {
        qrCodeBase64: pixData.qrCodeBase64,
        copiaECola: pixData.pixCopiaECola,
      },
    });
  } catch(e) {
    console.error('[Deposito]', e);
    res.status(500).json({ error: 'Erro ao gerar deposito.' });
  }
});
