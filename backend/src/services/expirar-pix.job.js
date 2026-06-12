// src/services/expirar-pix.job.js
// Roda a cada 5 minutos e expira cobranças PIX vencidas
// Adicione ao server.js: require('./services/expirar-pix.job')

const prisma = require('../models/prisma');
const mp     = require('./mercadopago.service');

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos

async function expirarPixVencidos() {
  try {
    const agora = new Date();

    // Busca pagamentos pendentes com expiração passada
    const vencidos = await prisma.pagamento.findMany({
      where: {
        status:    'PENDENTE',
        expiresAt: { lte: agora },
      },
    });

    if (!vencidos.length) return;

    console.log(`[JOB] Expirando ${vencidos.length} pagamento(s) PIX vencido(s)...`);

    for (const pag of vencidos) {
      try {
        // Tenta cancelar no Mercado Pago
        if (pag.mpPaymentId) {
          await mp.cancelarPagamento(pag.mpPaymentId).catch(() => {});
        }

        const palpiteIds = JSON.parse(pag.palpiteIds || '[]');

        await prisma.$transaction([
          prisma.pagamento.update({
            where: { id: pag.id },
            data:  { status: 'EXPIRADO' },
          }),
          // Remove palpites que nunca foram pagos
          prisma.palpiteCampanha.deleteMany({
            where: { id: { in: palpiteIds }, pagamentoConfirmado: false },
          }),
        ]);

        console.log(`[JOB] ✅ Pagamento ${pag.id} expirado. Palpites removidos: ${palpiteIds.join(', ')}`);
      } catch (err) {
        console.error(`[JOB] Erro ao expirar pagamento ${pag.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[JOB] Erro no job de expiração:', err.message);
  }
}

// Inicia o job quando o módulo é carregado
console.log('[JOB] Job de expiração PIX iniciado (a cada 5 min)');
expirarPixVencidos(); // roda imediatamente ao iniciar
setInterval(expirarPixVencidos, INTERVALO_MS);

module.exports = { expirarPixVencidos };
