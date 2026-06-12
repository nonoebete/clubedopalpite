// src/routes/auth.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const { autenticar } = require('../middleware/auth.middleware');

router.post('/cadastro',      ctrl.cadastrar);
router.post('/login',         ctrl.login);
router.post('/trocar-senha',  autenticar, ctrl.trocarSenha);
router.get('/minha-conta',    autenticar, ctrl.minhaConta);

module.exports = router;
