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

// Saldo consolidado do usuário
router.get('/saldo', autenticar, async (req, res) => {
  const prisma = require('../models/prisma');
  try {
    const usuarioId = req.user.id;
    // Saldo de premios (apenas palpitesCampanha tem premioRecebido)
    const palpitesCampanha = await prisma.palpiteCampanha.findMany({
      where: { usuarioId, pagamentoConfirmado: true, acertou: true },
      select: { premioRecebido: true }
    });
    const saldoPremios = palpitesCampanha.reduce((s, p) => s + Number(p.premioRecebido || 0), 0);
    // Saldo de depositos (pagamentos aprovados do tipo deposito - campanhaId=1 sem palpites)
    const depositos = await prisma.pagamento.findMany({
      where: { usuarioId, status: 'APROVADO', palpiteIds: '[]' },
      select: { valor: true }
    });
    const saldoDepositos = depositos.reduce((s, p) => s + Number(p.valor), 0);
    // Saldo de indicacoes (conta corrente)
    const conta = await prisma.contaCorrente.findUnique({ where: { usuarioId } });
    const saldoIndicacoes = Number(conta?.saldo || 0);
    res.json({
      saldoPremios,
      saldoDepositos,
      saldoIndicacoes,
      saldoTotal: saldoPremios + saldoDepositos + saldoIndicacoes
    });
  } catch(e) {
    console.error('[Saldo]', e);
    res.status(500).json({ error: 'Erro ao buscar saldo.' });
  }
});

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
