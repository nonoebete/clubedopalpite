// ═══════════════════════════════════════════════════════════════
//  server.js — Clube de Palpites · Copa do Mundo 2026
//  Versão COMPLETA: Auth + Palpites + PIX + WhatsApp + Admin
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

// ── Rotas ──────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth.routes');
const palpiteRoutes   = require('./routes/palpite.routes');
const campanhaRoutes  = require('./routes/campanha.routes');
const selecaoRoutes   = require('./routes/selecao.routes');
const adminRoutes     = require('./routes/admin.routes');
const pagamentoRoutes = require('./routes/pagamento.routes');
const whatsappRoutes  = require('./routes/whatsapp.routes');
const indicacaoRoutes = require('./routes/indicacao.routes');
const partidaRoutes   = require('./routes/partida.routes');
const placarRoutes    = require('./routes/placar.routes');

// ── Rotas da finalização (ranking público, extrato, gestão) ────
const { ranking, meuExtrato, listar, editar, resetarSenha, alterarStatus } =
  require('./controllers/finalizacao.controllers');
const { autenticar, apenasAdmin } = require('./middleware/auth.middleware');

// ── Jobs background ────────────────────────────────────────────
require('./services/expirar-pix.job');   // expira PIX não pagos a cada 5 min
require('./services/lembretes.job');     // lembretes WhatsApp de fase/PIX

const app  = express();
const PORT = process.env.PORT || 3333;

// ── Middlewares ─────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Webhook Mercado Pago exige body RAW antes do json()
app.use('/api/pagamentos/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

// ── Health check ────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status:  'ok',
  app:     'Clube de Palpites API · Copa 2026',
  versao:  '1.0.0',
  pix:     process.env.MP_ACCESS_TOKEN      ? '✅' : '⚠️ não configurado',
  wpp:     process.env.EVOLUTION_API_KEY    ? '✅' : '⚠️ não configurado',
  uptime:  Math.floor(process.uptime()) + 's',
}));

// ── Rotas principais ────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/palpites',   palpiteRoutes);
app.use('/api/campanhas',  campanhaRoutes);
app.use('/api/selecoes',   selecaoRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/pagamentos', pagamentoRoutes);
app.use('/api/whatsapp',   whatsappRoutes);
app.use('/api/indicacao',  indicacaoRoutes);
app.use('/api/partidas',   partidaRoutes);
app.use('/api/placar',     placarRoutes);

// ── Ranking público (sem auth) ──────────────────────────────────
app.get('/api/ranking', ranking);

// ── Extrato do palpiteiro ───────────────────────────────────────
app.get('/api/extrato/meu', autenticar, meuExtrato);

// ── Gestão de usuários (admin) ──────────────────────────────────
app.get   ('/api/admin/usuarios',              autenticar, apenasAdmin, listar);
app.put   ('/api/admin/usuarios/:id',          autenticar, apenasAdmin, editar);
app.post  ('/api/admin/usuarios/:id/senha',    autenticar, apenasAdmin, resetarSenha);
app.patch ('/api/admin/usuarios/:id/status',   autenticar, apenasAdmin, alterarStatus);

// ── Handler global de erros ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERRO]', err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Clube de Palpites API rodando em http://localhost:${PORT}`);
  console.log(`💳 PIX Mercado Pago : ${process.env.MP_ACCESS_TOKEN   ? '✅ configurado' : '⚠️  MP_ACCESS_TOKEN não definido'}`);
  console.log(`📱 WhatsApp Evo API : ${process.env.EVOLUTION_API_KEY ? '✅ configurado' : '⚠️  EVOLUTION_API_KEY não definido'}`);
  console.log(`🔄 Jobs background  : PIX expirador + lembretes WPP\n`);
});
