const router = require('express').Router();
const ctrl   = require('../controllers/whatsapp.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

router.post('/qrcode-webhook', ctrl.qrcodeWebhook);
router.get('/qrcode-show', ctrl.qrcodeShow);

router.use(autenticar, apenasAdmin);
router.get('/status',            ctrl.status);
router.get('/qrcode',            ctrl.qrcode);
router.post('/testar',           ctrl.testar);
router.post('/notificar-fase',   ctrl.notificarFaseManual);
module.exports = router;
