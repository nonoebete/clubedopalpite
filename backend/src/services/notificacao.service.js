// src/services/notificacao.service.js
// Orquestra todos os envios de WhatsApp do sistema

const wpp       = require('./whatsapp.service');
const templates = require('./templates.whatsapp');
const prisma    = require('../models/prisma');

// ═════════════════════════════════════════════════════════════
//  Envio com retry automático (até 3 tentativas)
// ═════════════════════════════════════════════════════════════
async function enviarComRetry(telefone, mensagem, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    const result = await wpp.enviarMensagem(telefone, mensagem);
    if (result.ok) return result;
    if (i < tentativas) {
      console.warn(`[WPP] Tentativa ${i}/${tentativas} falhou. Aguardando 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return { ok: false };
}

// ═════════════════════════════════════════════════════════════
//  1. BOAS-VINDAS — chamar em auth.controller.js após cadastro
// ═════════════════════════════════════════════════════════════
async function notificarBoasVindas(usuario, senhaAcesso) {
  if (!usuario.telefone) return;
  const msg = templates.boasVindas({
    nomeCompleto: usuario.nomeCompleto,
    apelido:      usuario.apelido,
    codigoCdp:    usuario.codigoCdp,
    senhaAcesso,
  });
  return enviarComRetry(usuario.telefone, msg);
}

// ═════════════════════════════════════════════════════════════
//  2. PALPITE CONFIRMADO — chamar no webhook do PIX (aprovado)
// ═════════════════════════════════════════════════════════════
async function notificarPalpiteConfirmado(pagamentoId) {
  try {
    const pagamento = await prisma.pagamento.findUnique({
      where:   { id: pagamentoId },
      include: {
        usuario:  true,
        campanha: true,
      },
    });
    if (!pagamento?.usuario?.telefone) return;

    // Busca os palpites vinculados
    const palpiteIds = JSON.parse(pagamento.palpiteIds || '[]');
    const palpites   = await prisma.palpiteCampanha.findMany({
      where:   { id: { in: palpiteIds } },
      include: {
        selecaoCampea: true,
        selecaoVice:   true,
      },
    });

    // Monta lista para o template
    const listaPalpites = palpites.map(p => {
      if (pagamento.campanha.tipo === 'CAMPEA_VICE' && p.selecaoVice) {
        return {
          bandeiraCss: p.selecaoCampea.bandeiraCss,
          nome: `${p.selecaoCampea.nome} + ${p.selecaoVice.nome}`,
        };
      }
      return { bandeiraCss: p.selecaoCampea.bandeiraCss, nome: p.selecaoCampea.nome };
    });

    const msg = templates.palpiteConfirmado({
      apelido:   pagamento.usuario.apelido,
      codigoCdp: pagamento.usuario.codigoCdp,
      fase:      pagamento.campanha.fase,
      palpites:  listaPalpites,
      valorPago: pagamento.valor,
      pagoEm:    pagamento.pagoEm,
    });

    return enviarComRetry(pagamento.usuario.telefone, msg);
  } catch (err) {
    console.error('[WPP] Erro ao notificar palpite confirmado:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════
//  3. LEMBRETE FASE — chamar via job agendado
//     tipo: 'abrindo' | 'encerrando'
// ═════════════════════════════════════════════════════════════
async function notificarFase(campanhaId, tipo) {
  try {
    const campanha = await prisma.campanha.findUnique({ where: { id: campanhaId } });
    if (!campanha) return;

    // Busca todos os usuários com telefone cadastrado
    const usuarios = await prisma.usuario.findMany({
      where:  { perfil: 'PALPITEIRO', telefone: { not: '' } },
      select: { id: true, apelido: true, telefone: true },
    });

    console.log(`[WPP] Disparando lembrete "${tipo}" para ${usuarios.length} membros...`);

    for (const u of usuarios) {
      let msg;
      if (tipo === 'abrindo') {
        msg = templates.fasePrestesAbrir({
          apelido:      u.apelido,
          fase:         campanha.fase,
          dataInicio:   campanha.inicio,
          valorPalpite: campanha.valorPalpite,
        });
      } else {
        const horasRestantes = Math.ceil(
          (new Date(campanha.fim) - new Date()) / (1000 * 60 * 60)
        );
        msg = templates.faseEncerrando({
          apelido:         u.apelido,
          fase:            campanha.fase,
          dataFim:         campanha.fim,
          horasRestantes:  Math.max(1, horasRestantes),
        });
      }

      await enviarComRetry(u.telefone, msg);
      // Aguarda 500ms entre envios para não ser bloqueado
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[WPP] ✅ Lembrete "${tipo}" enviado para ${usuarios.length} membros.`);
  } catch (err) {
    console.error('[WPP] Erro ao notificar fase:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════
//  4. RESULTADO DA APURAÇÃO — chamar em admin.controller.js
// ═════════════════════════════════════════════════════════════
async function notificarResultado(campanhaId, selecaoCampeaId, selecaoViceId) {
  try {
    const campanha      = await prisma.campanha.findUnique({ where: { id: campanhaId } });
    const selecaoCampea = await prisma.selecao.findUnique({ where: { id: selecaoCampeaId } });
    const selecaoVice   = selecaoViceId
      ? await prisma.selecao.findUnique({ where: { id: selecaoViceId } })
      : null;

    const agg = await prisma.palpiteCampanha.aggregate({
      where: { campanhaId },
      _sum:  { valorPago: true },
    });
    const totalArrecadado = Number(agg._sum.valorPago || 0);
    const acertadores     = await prisma.palpiteCampanha.count({
      where: { campanhaId, acertou: true },
    });

    // Busca todos os palpiteiros desta campanha
    const palpitesComUsuario = await prisma.palpiteCampanha.findMany({
      where:   { campanhaId, pagamentoConfirmado: true },
      include: { usuario: true },
      distinct: ['usuarioId'],
    });

    console.log(`[WPP] Notificando resultado para ${palpitesComUsuario.length} membros...`);

    for (const p of palpitesComUsuario) {
      if (!p.usuario?.telefone) continue;

      const msg = templates.resultadoApuracao({
        apelido:          p.usuario.apelido,
        fase:             campanha.fase,
        acertou:          p.acertou === true,
        selecaoCampea,
        selecaoVice,
        premioRecebido:   p.premioRecebido || 0,
        totalAcertadores: acertadores,
        totalArrecadado,
      });

      await enviarComRetry(p.usuario.telefone, msg);
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[WPP] ✅ Resultado notificado para ${palpitesComUsuario.length} membros.`);
  } catch (err) {
    console.error('[WPP] Erro ao notificar resultado:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════
//  5. LEMBRETE PIX PENDENTE — job roda a cada 5 min
// ═════════════════════════════════════════════════════════════
async function notificarPixPendente() {
  try {
    const agora        = new Date();
    const limite5min   = new Date(agora.getTime() - 25 * 60 * 1000); // criado há 25 min
    const limite30min  = new Date(agora.getTime() - 30 * 60 * 1000); // expira em breve

    const pendentes = await prisma.pagamento.findMany({
      where: {
        status:    'PENDENTE',
        criadoEm:  { lte: limite5min, gte: limite30min },
        // Só manda lembrete uma vez (sem campo específico, filtra por hora)
      },
      include: { usuario: true },
    });

    for (const pag of pendentes) {
      if (!pag.usuario?.telefone) continue;
      const minutosRestantes = Math.max(1, Math.ceil(
        (new Date(pag.expiresAt) - agora) / (1000 * 60)
      ));
      const msg = templates.lembretePix({
        apelido:          pag.usuario.apelido,
        valor:            pag.valor,
        minutosRestantes,
      });
      await enviarComRetry(pag.usuario.telefone, msg);
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.error('[WPP] Erro no lembrete PIX:', err.message);
  }
}

module.exports = {
  notificarBoasVindas,
  notificarPalpiteConfirmado,
  notificarFase,
  notificarResultado,
  notificarPixPendente,
};
