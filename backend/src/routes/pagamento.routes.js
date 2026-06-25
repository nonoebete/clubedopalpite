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
