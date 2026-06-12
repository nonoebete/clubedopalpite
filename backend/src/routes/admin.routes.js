// src/routes/admin.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

router.use(autenticar, apenasAdmin); // todas as rotas admin protegidas

router.post('/apurar',         ctrl.apurar);
router.get('/financeiro',      ctrl.financeiro);
router.get('/usuarios',        ctrl.listarUsuarios);

module.exports = router;
