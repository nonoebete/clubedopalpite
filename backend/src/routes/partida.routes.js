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
