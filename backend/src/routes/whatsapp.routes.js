// src/routes/whatsapp.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/whatsapp.controller');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

// ── Rotas PÚBLICAS (sem autenticação) ──────────────────────
// Webhook do Evolution para receber QR Code
router.post('/qrcode-webhook', ctrl.qrcodeWebhook);
// Página HTML para visualizar o QR Code
router.get('/qrcode-show', ctrl.qrcodeShow);

// ── Rotas ADMIN (requerem autenticação) ────────────────────
router.use(autenticar, apenasAdmin);
router.get('/status',            ctrl.status);
router.get('/qrcode',            ctrl.qrcode);
router.post('/testar',           ctrl.testar);
router.post('/notificar-fase',   ctrl.notificarFaseManual);

module.exports = router;
