// src/routes/partida.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/partida.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

// ── Públicas / autenticadas (palpiteiro) ───────────────────────
router.get('/',                  ctrl.listar);              // lista partidas de uma campanha
router.post('/palpitar',         autenticar, ctrl.palpitar);
router.get('/meus-palpites',     autenticar, ctrl.meusPalpites);
router.get('/ranking-pontuacao', ctrl.rankingPontuacao);     // público

// ── Admin ──────────────────────────────────────────────────────
router.post ('/admin/partidas',                  autenticar, apenasAdmin, ctrl.criarPartida);
router.patch('/admin/partidas/:id/resultado',    autenticar, apenasAdmin, ctrl.definirResultado);
router.post ('/admin/apurar-campanha',           autenticar, apenasAdmin, ctrl.apurarCampanha);

module.exports = router;

// Atualizar seleções de uma partida (chaveamento)
router.patch('/admin/partidas/:id/chaveamento', autenticar, apenasAdmin, async (req, res) => {
  const prisma = require('../models/prisma');
  const { selecaoCasaId, selecaoForaId, dataHora, grupo, golsCasa, golsFora, resultado, encerrada } = req.body;
  try {
    const data = {};
    if (selecaoCasaId !== undefined) data.selecaoCasaId = Number(selecaoCasaId);
    if (selecaoForaId !== undefined) data.selecaoForaId = Number(selecaoForaId);
    if (dataHora !== undefined) data.dataHora = new Date(dataHora);
    if (grupo !== undefined) data.grupo = grupo;
    if (golsCasa !== undefined) data.golsCasa = Number(golsCasa);
    if (golsFora !== undefined) data.golsFora = Number(golsFora);
    if (resultado !== undefined) data.resultado = resultado;
    if (encerrada !== undefined) data.encerrada = encerrada;
    const partida = await prisma.partida.update({ where: { id: Number(req.params.id) }, data });
    res.json({ ok: true, partida });
  } catch(e) {
    res.status(500).json({ error: 'Erro ao atualizar partida.' });
  }
});

// Criar nova partida (chaveamento)
router.post('/admin/partidas/nova', autenticar, apenasAdmin, async (req, res) => {
  const prisma = require('../models/prisma');
  const { campanhaId, selecaoCasaId, selecaoForaId, dataHora, grupo } = req.body;
  try {
    const partida = await prisma.partida.create({
      data: {
        campanhaId: Number(campanhaId),
        selecaoCasaId: Number(selecaoCasaId),
        selecaoForaId: Number(selecaoForaId),
        dataHora: new Date(dataHora),
        grupo: grupo || 'O',
      }
    });
    res.status(201).json({ ok: true, partida });
  } catch(e) {
    res.status(500).json({ error: 'Erro ao criar partida.' });
  }
});
