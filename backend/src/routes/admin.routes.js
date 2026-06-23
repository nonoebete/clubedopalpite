// src/routes/admin.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

router.use(autenticar, apenasAdmin); // todas as rotas admin protegidas

router.post('/apurar',         ctrl.apurar);
router.get('/financeiro',      ctrl.financeiro);
router.get('/usuarios',        ctrl.listarUsuarios);
router.put('/usuarios/:id',                  ctrl.editarUsuario);
router.patch('/usuarios/:id/bloqueio',       ctrl.alternarBloqueio);
router.post('/usuarios/:id/resetar-senha',   ctrl.resetarSenha);
router.delete('/usuarios/:id',               ctrl.excluirUsuario);

module.exports = router;
