// src/routes/indicacao.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/indicacao.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

// ── Públicas ───────────────────────────────────────────────────
// Cadastro com ref de indicação
router.post('/cadastrar', ctrl.cadastrarComIndicacao);

// ── Autenticadas (palpiteiro logado) ───────────────────────────
router.get ('/minha-conta', autenticar, ctrl.minhaConta);
router.post('/resgatar',    autenticar, ctrl.solicitarResgate);

// ── Admin ──────────────────────────────────────────────────────
router.get  ('/admin/indicadores',      autenticar, apenasAdmin, ctrl.listarIndicadores);
router.get  ('/admin/resgates',         autenticar, apenasAdmin, ctrl.listarResgates);
router.patch('/admin/resgates/:id',     autenticar, apenasAdmin, ctrl.atualizarResgate);
router.get  ('/admin/config',           autenticar, apenasAdmin, ctrl.getConfigIndicacao);
router.put  ('/admin/config',           autenticar, apenasAdmin, ctrl.updateConfigIndicacao);

module.exports = router;
