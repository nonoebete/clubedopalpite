const router = require('express').Router();
const prisma = require('../models/prisma');
const { autenticar } = require('../middleware/auth.middleware');
const mp = require('../services/mercadopago.service');

// GET /api/placar/jogos — jogos disponíveis para palpite de placar
router.get('/jogos', autenticar, async (req, res) => {
  try {
    const campanha = await prisma.campanha.findFirst({ where: { fase: 4, ativa: true } });
    if (!campanha) return res.json({ jogos: [], campanha: null });
    const campanha3 = await prisma.campanha.findFirst({ where: { fase: 3 } });
    if (!campanha3) return res.json({ jogos: [], campanha });
    const partidas = await prisma.partida.findMany({
      where: { campanhaId: campanha3.id, encerrada: false },
      include: {
        selecaoCasa: { select: { id: true, nome: true, bandeiraCss: true } },
        selecaoFora: { select: { id: true, nome: true, bandeiraCss: true } },
      },
      orderBy: { dataHora: 'asc' },
    });
    const meusPalpites = await prisma.palpitePlacar.findMany({
      where: { usuarioId: req.usuario.id },
      select: { partidaId: true, golsCasa: true, golsFora: true, pagamentoConfirmado: true },
    });
    res.json({ jogos: partidas, campanha, meusPalpites });
  } catch(e) {
    console.error('[PlacarJogos]', e);
    res.status(500).json({ error: 'Erro ao buscar jogos.' });
  }
});

// POST /api/placar/palpitar — registra palpites de placar com PIX
router.post('/palpitar', autenticar, async (req, res) => {
  const { palpites } = req.body;
  if (!Array.isArray(palpites) || palpites.length === 0) {
    return res.status(400).json({ error: 'Informe os palpites.' });
  }
  try {
    const usuarioId = req.usuario.id;
    const campanha = await prisma.campanha.findFirst({ where: { fase: 4, ativa: true } });
    if (!campanha) return res.status(400).json({ error: 'Campanha 4ª fase não está ativa.' });

    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    const valorUnit = Number(campanha.valorPalpite);
    const totalValor = valorUnit * palpites.length;

    // Cria pagamento temporário
    const pagamentoTemp = await prisma.pagamento.create({
      data: {
        usuarioId,
        campanhaId: campanha.id,
        valor: totalValor,
        status: 'PENDENTE',
        palpiteIds: '[]',
        expiresAt: new Date(Date.now() + 35 * 60 * 1000),
      },
    });

    // Cria palpites vinculados ao pagamento
    const palpitesCriados = await prisma.$transaction(
      palpites.map(p => prisma.palpitePlacar.create({
        data: {
          usuarioId,
          partidaId: Number(p.partidaId),
          pagamentoId: pagamentoTemp.id,
          golsCasa: Number(p.golsCasa),
          golsFora: Number(p.golsFora),
          valorPago: valorUnit,
          pagamentoConfirmado: false,
        },
      }))
    );

    const palpiteIds = palpitesCriados.map(p => p.id);
    const descricao = `4ª Fase Palpite Placar · ${usuario.apelido} (${usuario.codigoCdp}) · ${palpites.length} jogo(s)`;

    const pixData = await mp.criarCobrancaPix({
      valor: totalValor,
      descricao,
      pagadorNome: usuario.nomeCompleto,
      pagadorEmail: usuario.email || `${usuario.codigoCdp.toLowerCase()}@clubedopalpite.com`,
      pagadorCpf: usuario.cpf || '00000000000',
      referenciaExterna: `placar_${palpiteIds.join('_')}`,
      expiracaoMinutos: 30,
    });

    const pagamento = await prisma.pagamento.update({
      where: { id: pagamentoTemp.id },
      data: {
        palpiteIds: JSON.stringify(palpiteIds),
        mpPaymentId: String(pixData.mpPaymentId),
        qrCode: pixData.qrCode,
        qrCodeBase64: pixData.qrCodeBase64,
        pixCopiaECola: pixData.pixCopiaECola,
        expiresAt: new Date(pixData.expiresAt),
      },
    });

    res.status(201).json({
      pagamentoId: pagamento.id,
      total: totalValor,
      qrCode: pixData.qrCode,
      qrCodeBase64: pixData.qrCodeBase64,
      pixCopiaECola: pixData.pixCopiaECola,
    });
  } catch(e) {
    console.error('[PlacarPalpitar]', e);
    res.status(500).json({ error: 'Erro ao registrar palpites.' });
  }
});

// GET /api/placar/meus — meus palpites de placar
router.get('/meus', autenticar, async (req, res) => {
  try {
    const palpites = await prisma.palpitePlacar.findMany({
      where: { usuarioId: req.usuario.id },
      include: {
        partida: {
          include: {
            selecaoCasa: { select: { nome: true, bandeiraCss: true } },
            selecaoFora: { select: { nome: true, bandeiraCss: true } },
          }
        }
      },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(palpites);
  } catch(e) {
    res.status(500).json({ error: 'Erro ao buscar palpites.' });
  }
});

module.exports = router;
