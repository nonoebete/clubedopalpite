// src/services/lembretes.job.js
// Roda em background verificando quando disparar lembretes de fase
// Adicione ao server.js: require('./services/lembretes.job')

const prisma  = require('../models/prisma');
const notif   = require('./notificacao.service');

const INTERVALO_MS = 5 * 60 * 1000; // verifica a cada 5 minutos

// Controle de lembretes já enviados (evita duplicatas na mesma execução)
const lembretesEnviados = new Set();

async function verificarLembretes() {
  const agora = new Date();

  try {
    const campanhas = await prisma.campanha.findMany({
      where: { ativa: true },
    });

    for (const c of campanhas) {
      const inicio   = new Date(c.inicio);
      const fim      = new Date(c.fim);
      const diffInicioMin = (inicio - agora) / (1000 * 60);
      const diffFimHoras  = (fim - agora)    / (1000 * 60 * 60);

      // ── Lembrete: fase prestes a abrir (janela de 55–65 min antes) ─
      const keyAbrindo = `abrindo_${c.id}`;
      if (diffInicioMin >= 55 && diffInicioMin <= 65 && !lembretesEnviados.has(keyAbrindo)) {
        console.log(`[JOB-WPP] 🔔 Disparando lembrete "abrindo" para campanha ${c.id}`);
        lembretesEnviados.add(keyAbrindo);
        await notif.notificarFase(c.id, 'abrindo');
      }

      // ── Lembrete: fase encerrando (janela de 23–25h antes do fim) ──
      const keyEncerrando = `encerrando_${c.id}`;
      if (diffFimHoras >= 23 && diffFimHoras <= 25 && !lembretesEnviados.has(keyEncerrando)) {
        console.log(`[JOB-WPP] ⏰ Disparando lembrete "encerrando" para campanha ${c.id}`);
        lembretesEnviados.add(keyEncerrando);
        await notif.notificarFase(c.id, 'encerrando');
      }
    }

    // ── Lembrete PIX pendente ──────────────────────────────────────
    await notif.notificarPixPendente();

  } catch (err) {
    console.error('[JOB-WPP] Erro no job de lembretes:', err.message);
  }
}

// Limpa cache de lembretes a cada 24h (reinicia contagem diária)
setInterval(() => lembretesEnviados.clear(), 24 * 60 * 60 * 1000);

console.log('[JOB-WPP] Job de lembretes WhatsApp iniciado (a cada 5 min)');
verificarLembretes();
setInterval(verificarLembretes, INTERVALO_MS);

module.exports = { verificarLembretes };
