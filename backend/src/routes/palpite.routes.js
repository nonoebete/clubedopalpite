// src/routes/palpite.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/palpite.controller');
const { autenticar } = require('../middleware/auth.middleware');

router.post('/',        autenticar, ctrl.registrar);
router.get('/meus',     autenticar, ctrl.meusPalpites);
router.get('/ranking',  ctrl.ranking); // público

module.exports = router;
