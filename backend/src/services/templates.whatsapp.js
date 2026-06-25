// src/services/templates.whatsapp.js
// Todas as mensagens enviadas pelo Clube de Palpites via WhatsApp
// Emojis e formatação compatível com WhatsApp Web/Mobile

const CLUBE = 'Clube de Palpites 🏆';

// ═════════════════════════════════════════════════════════════
//  1. BOAS-VINDAS — disparado no cadastro
// ═════════════════════════════════════════════════════════════
function boasVindas({ nomeCompleto, apelido, codigoCdp, senhaAcesso }) {
  const primeiroNome = nomeCompleto.split(' ')[0];
  return `🎉 *Bem-vindo ao ${CLUBE}!*

Olá, *${primeiroNome}*! Seu cadastro foi realizado com sucesso.

Aqui estão seus dados de acesso — *guarde esta mensagem:*

🪪 *Código CDP:* \`${codigoCdp}\`
🔑 *Senha:* \`${senhaAcesso}\`

📱 Acesse o portal e faça seus palpites:
👉 https://clubedopalpite.app.br/login.html

━━━━━━━━━━━━━━━━━━━━━
🌍 *Copa do Mundo 2026*
⚽ 48 seleções · 2 fases de palpites
💰 60% da arrecadação em prêmios!
━━━━━━━━━━━━━━━━━━━━━

Boa sorte, *${apelido}*! 🍀`;
}

// ═════════════════════════════════════════════════════════════
//  2. PALPITE CONFIRMADO — disparado após PIX aprovado
// ═════════════════════════════════════════════════════════════
function palpiteConfirmado({ apelido, codigoCdp, fase, faseLabel: faseLabelCustom, palpites, valorPago, pagoEm }) {
  const dataHora = pagoEm
    ? new Date(pagoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const listaSelecoes = Array.isArray(palpites)
    ? palpites.map(p => `  • ${p.bandeiraCss || '⚽'} ${p.nome}`).join('\n')
    : `  • ${palpites}`;

  const faseLabel = faseLabelCustom || (fase === 1
    ? '1ª Fase — Seleção Campeã'
    : '2ª Fase — Campeã + Vice-Campeã');

  return `✅ *Palpite confirmado, ${apelido}!*

Seu pagamento PIX foi aprovado e seu(s) palpite(s) estão registrados.

📋 *Resumo:*
👤 ${codigoCdp} · ${apelido}
🏆 ${faseLabel}
⚽ *Palpite(s):*
${listaSelecoes}

💰 *Valor pago:* R$ ${Number(valorPago).toFixed(2)}
🕐 *Confirmado em:* ${dataHora}

━━━━━━━━━━━━━━━━━━━━━
Torça muito! 🇧🇷🏆
Acompanhe seus palpites em:
👉 https://clubedopalpite.app.br/portal.html`;
}

// ═════════════════════════════════════════════════════════════
//  3. LEMBRETE FASE ABRINDO — 1 hora antes do início
// ═════════════════════════════════════════════════════════════
function fasePrestesAbrir({ apelido, fase, dataInicio, valorPalpite }) {
  const faseNum   = fase === 1 ? '1ª' : '2ª';
  const faseLabel = fase === 1 ? 'Seleção Campeã' : 'Campeã + Vice-Campeã';
  const dataFmt   = new Date(dataInicio).toLocaleDateString('pt-BR');

  return `🔔 *Atenção, ${apelido}!*

A *${faseNum} Fase* do Clube de Palpites abre hoje!

🏆 *${faseNum} Fase — ${faseLabel}*
📅 Início: *${dataFmt}*
💰 Valor: *R$ ${Number(valorPalpite).toFixed(2)}* por palpite

Não perca tempo — faça seu palpite antes que feche!

👉 https://clubedopalpite.app.br/portal.html

_Boa sorte!_ 🍀`;
}

// ═════════════════════════════════════════════════════════════
//  4. LEMBRETE FASE ENCERRANDO — 24h antes do fim
// ═════════════════════════════════════════════════════════════
function faseEncerrando({ apelido, fase, dataFim, horasRestantes }) {
  const faseNum   = fase === 1 ? '1ª' : '2ª';
  const faseLabel = fase === 1 ? 'Seleção Campeã' : 'Campeã + Vice-Campeã';
  const dataFmt   = new Date(dataFim).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return `⏰ *Últimas ${horasRestantes}h, ${apelido}!*

A *${faseNum} Fase* encerra em breve!

🏆 *${faseNum} Fase — ${faseLabel}*
⌛ Encerra em: *${dataFmt}*

Após esse horário, *não será mais possível* registrar novos palpites nesta fase.

👉 *Faça agora:* https://clubedopalpite.app.br/portal.html

_Não deixe para a última hora!_ ⚡`;
}

// ═════════════════════════════════════════════════════════════
//  5. RESULTADO E PRÊMIO — após apuração pelo admin
// ═════════════════════════════════════════════════════════════
function resultadoApuracao({
  apelido, fase, acertou,
  selecaoCampea, selecaoVice,
  premioRecebido, totalAcertadores,
  totalArrecadado,
}) {
  const faseNum   = fase === 1 ? '1ª' : '2ª';
  const faseLabel = fase === 1 ? 'Seleção Campeã' : 'Campeã + Vice-Campeã';

  if (acertou) {
    const premio = Number(premioRecebido).toLocaleString('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    const resultado = fase === 1
      ? `${selecaoCampea.bandeiraCss || '⚽'} *${selecaoCampea.nome}*`
      : `${selecaoCampea.bandeiraCss || '⚽'} *${selecaoCampea.nome}* + ${selecaoVice?.bandeiraCss || '⚽'} *${selecaoVice?.nome}*`;

    return `🏆 *PARABÉNS, ${apelido}! Você ACERTOU!* 🏆

Resultado oficial da *${faseNum} Fase — ${faseLabel}:*
${resultado}

🎯 *Você acertou o palpite!*
💰 *Seu prêmio: R$ ${premio}*

━━━━━━━━━━━━━━━━━━━━━
📊 *Estatísticas da rodada:*
👥 Acertadores: ${totalAcertadores}
💵 Total arrecadado: R$ ${Number(totalArrecadado).toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━

Entre em contato com o administrador para receber seu prêmio!
🎉 *${CLUBE}*`;
  } else {
    const resultado = fase === 1
      ? `${selecaoCampea.bandeiraCss || '⚽'} *${selecaoCampea.nome}*`
      : `${selecaoCampea.bandeiraCss || '⚽'} *${selecaoCampea.nome}* + ${selecaoVice?.bandeiraCss || '⚽'} *${selecaoVice?.nome}*`;

    return `📊 *Resultado da ${faseNum} Fase, ${apelido}*

Resultado oficial — *${faseLabel}:*
${resultado}

😔 Desta vez não foi, mas não desanime!

${fase === 1
  ? '👉 A *2ª Fase* ainda está por vir — faça seus palpites para a Campeã + Vice!'
  : '🏆 Obrigado por participar do Clube de Palpites Copa 2026!'}

_${CLUBE}_ 🌍`;
  }
}

// ═════════════════════════════════════════════════════════════
//  6. LEMBRETE PAGAMENTO PIX PENDENTE — 25 min após gerar
// ═════════════════════════════════════════════════════════════
function lembretePix({ apelido, valor, minutosRestantes }) {
  return `⏳ *Seu PIX ainda não foi pago, ${apelido}!*

Você tem um palpite aguardando pagamento.

💰 *Valor:* R$ ${Number(valor).toFixed(2)}
⌛ *Expira em:* ~${minutosRestantes} minutos

Se não pagar até lá, o palpite será cancelado automaticamente.

👉 Acesse e finalize o pagamento:
https://clubedopalpite.app.br/portal.html

_${CLUBE}_ ⚽`;
}

module.exports = {
  boasVindas,
  palpiteConfirmado,
  fasePrestesAbrir,
  faseEncerrando,
  resultadoApuracao,
  lembretePix,
};

// ── Bônus de indicação ─────────────────────────────────────────
function notificarBonus(usuario, valor, apelidoIndicado) {
  const nome = usuario.nomeCompleto.split(' ')[0];
  return `💰 *${nome}, você ganhou R$ ${Number(valor).toFixed(2)}!*

*${apelidoIndicado}* se cadastrou pelo seu link de indicação.

✅ Seu saldo foi atualizado na conta corrente do Clube!

Acesse seu portal para ver o extrato e resgatar:
👉 ${process.env.APP_URL}/indicacoes.html`;
}

// ── Bônus de indicação por marco de palpites ────────────────────
function notificarBonusMarco(usuario, valor, apelidoIndicado, totalPalpites) {
  const nome = usuario.nomeCompleto.split(' ')[0];
  return `🎉 *${nome}, você ganhou R$ ${Number(valor).toFixed(2)} de bônus!*

Seu indicado *${apelidoIndicado}* atingiu *${totalPalpites} palpites pagos*! 🏆

A cada 100 palpites realizados por um indicado seu, você ganha R$ 100,00 extra na sua conta corrente do Clube.

Acesse seu portal para ver o extrato e resgatar:
👉 ${process.env.APP_URL}/indicacoes.html`;
}

module.exports = { ...module.exports, notificarBonus, notificarBonusMarco };
