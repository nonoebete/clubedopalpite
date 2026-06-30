// src/routes/placar.routes.js
const router = require('express').Router();
const prisma = require('../models/prisma');
const { autenticar } = require('../middleware/auth.middleware');

// GET /api/placar/jogos — jogos disponíveis para palpite (mesmos da 3ª fase)
router.get('/jogos', autenticar, async (req, res) => {
  try {
    const campanha = await prisma.campanha.findFirst({
      where: { fase: 4, ativa: true },
    });
    if (!campanha) return res.json({ jogos: [], campanha: null });

    // Usa as partidas da campanha fase 3
    const campanha3 = await prisma.campanha.findFirst({ where: { fase: 3 } });
    if (!campanha3) return res.json({ jogos: [], campanha });

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(23, 59, 59);

    const partidas = await prisma.partida.findMany({
      where: {
        campanhaId: campanha3.id,
        encerrada: false,
        dataHora: { gte: new Date(hoje.setHours(0,0,0,0)), lte: amanha },
      },
      include: {
        selecaoCasa: { select: { id: true, nome: true, bandeiraCss: true } },
        selecaoFora: { select: { id: true, nome: true, bandeiraCss: true } },
      },
      orderBy: { dataHora: 'asc' },
    });

    // Palpites já feitos pelo usuário
    const meusPalpites = await prisma.palpitePlacar.findMany({
      where: { usuarioId: req.usuario.id, partida: { campanhaId: campanha3.id } },
      select: { partidaId: true, golsCasa: true, golsFora: true, pagamentoConfirmado: true },
    });

    res.json({ jogos: partidas, campanha, meusPalpites });
  } catch(e) {
    console.error('[PlacarJogos]', e);
    res.status(500).json({ error: 'Erro ao buscar jogos.' });
  }
});

// POST /api/placar/palpitar — registra palpite de placar
router.post('/palpitar', autenticar, async (req, res) => {
  const { palpites } = req.body;
  // palpites = [{ partidaId, golsCasa, golsFora }]
  if (!Array.isArray(palpites) || palpites.length === 0) {
    return res.status(400).json({ error: 'Informe os palpites.' });
  }
  try {
    const campanha = await prisma.campanha.findFirst({ where: { fase: 4, ativa: true } });
    if (!campanha) return res.status(400).json({ error: 'Campanha 4ª fase não está ativa.' });

    const valorUnit = Number(campanha.valorPalpite);
    const totalValor = valorUnit * palpites.length;

    // Cria pagamento PIX
    const mp = require('../services/mercadopago.service');
    const pix = await mp.criarPix({
      valor: totalValor,
      descricao: `Palpite Placar - ${palpites.length} jogo(s)`,
      usuarioId: req.usuario.id,
    });

    // Cria pagamento no banco
    const pagamento = await prisma.pagamento.create({
      data: {
        usuarioId:   req.usuario.id,
        campanhaId:  campanha.id,
        valor:       totalValor,
        status:      'PENDENTE',
        mpPaymentId: pix.id?.toString() || null,
        qrCode:      pix.qrCode || null,
        qrCodeBase64: pix.qrCodeBase64 || null,
        pixCopiaECola: pix.pixCopiaECola || null,
        expiresAt:   new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    // Cria palpites de placar vinculados ao pagamento
    await prisma.palpitePlacar.createMany({
      data: palpites.map(p => ({
        usuarioId:  req.usuario.id,
        partidaId:  Number(p.partidaId),
        pagamentoId: pagamento.id,
        golsCasa:   Number(p.golsCasa),
        golsFora:   Number(p.golsFora),
        valorPago:  valorUnit,
      })),
    });

    res.status(201).json({
      mensagem: 'Palpites registrados! Efetue o pagamento PIX.',
      pagamentoId: pagamento.id,
      total: totalValor,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      pixCopiaECola: pix.pixCopiaECola,
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
