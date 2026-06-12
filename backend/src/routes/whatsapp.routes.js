// src/routes/whatsapp.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/whatsapp.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

router.use(autenticar, apenasAdmin); // todas requerem admin

router.get('/status',            ctrl.status);
router.get('/qrcode',            ctrl.qrcode);
router.post('/testar',           ctrl.testar);
router.post('/notificar-fase',   ctrl.notificarFaseManual);

module.exports = router;
