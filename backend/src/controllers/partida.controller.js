// src/controllers/partida.controller.js
// Campanha 3 — Palpite por Resultado (Vitória Casa / Vitória Fora / Empate)
// Regras: R$10 por palpite · 3 pontos por acerto · rateio 60% entre Top 3 pontuadores
// Rateio: 1º lugar 30% · 2º lugar 20% · 3º lugar 10% (sobre o total arrecadado)
// Em caso de empate de pontos, o valor da posição é dividido entre os empatados

const prisma = require('../models/prisma');

const PONTOS_POR_ACERTO = 3;

// ── Verifica se a campanha está aberta no momento ──────────────
function campanhaAberta(campanha) {
  const agora = new Date();
  return campanha.ativa && agora >= campanha.inicio && agora <= campanha.fim;
}

// ── Constante compartilhada: janela de fechamento de palpites ──
const MARGEM_FECHAMENTO_MIN = 10;

function abertaParaPalpite(partida) {
  if (partida.encerrada) return false;
  const limite = new Date(partida.dataHora.getTime() - MARGEM_FECHAMENTO_MIN * 60 * 1000);
  return new Date() < limite;
}

// ══════════════════════════════════════════════════════════════
//  GET /api/partidas?campanhaId=3
//  Lista as partidas de uma campanha, com bandeiras e status
// ══════════════════════════════════════════════════════════════
async function listar(req, res) {
  const { campanhaId } = req.query;
  if (!campanhaId) return res.status(400).json({ error: 'Informe campanhaId.' });

  try {
    const partidas = await prisma.partida.findMany({
      where:   { campanhaId: Number(campanhaId) },
      include: {
        selecaoCasa: { select: { nome: true, sigla: true, bandeiraCss: true } },
        selecaoFora: { select: { nome: true, sigla: true, bandeiraCss: true } },
      },
      orderBy: { dataHora: 'asc' },
    });

    return res.json(partidas.map(p => ({
      id:        p.id,
      grupo:     p.grupo,
      dataHora:  p.dataHora,
      encerrada: p.encerrada,
      resultado: p.resultado,
      abertaParaPalpite: abertaParaPalpite(p),
      casa: { nome: p.selecaoCasa.nome, sigla: p.selecaoCasa.sigla, bandeira: p.selecaoCasa.bandeiraCss },
      fora: { nome: p.selecaoFora.nome, sigla: p.selecaoFora.sigla, bandeira: p.selecaoFora.bandeiraCss },
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar partidas.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  POST /api/partidas/palpitar
//  Body: { campanhaId, palpites: [ { partidaId, resultado: 'CASA'|'FORA'|'EMPATE' } ] }
//  REGRA: R$ 10,00 por BILHETE — o palpiteiro escolhe quantos jogos quiser
//         num único bilhete de valor fixo. Cada acerto vale 3 pontos.
// ══════════════════════════════════════════════════════════════
async function palpitar(req, res) {
  const { campanhaId, palpites } = req.body;
  const usuarioId = req.user.id;

  if (!campanhaId || !Array.isArray(palpites) || palpites.length === 0) {
    return res.status(400).json({ error: 'Informe campanhaId e ao menos um palpite.' });
  }

  try {
    const campanha = await prisma.campanha.findUnique({ where: { id: Number(campanhaId) } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });
    if (campanha.tipo !== 'PALPITE_RESULTADO') {
      return res.status(400).json({ error: 'Esta rota é exclusiva da campanha de palpite por resultado.' });
    }
    if (!campanhaAberta(campanha)) {
      return res.status(400).json({ error: 'Esta campanha não está aberta para novos palpites.' });
    }

    // Valida cada palpite
    const partidaIds = palpites.map(p => Number(p.partidaId));
    const partidas = await prisma.partida.findMany({ where: { id: { in: partidaIds } } });
    const mapaPartidas = Object.fromEntries(partidas.map(p => [p.id, p]));

    const agora = new Date();

    for (const p of palpites) {
      const partida = mapaPartidas[Number(p.partidaId)];
      if (!partida) return res.status(404).json({ error: `Partida ${p.partidaId} não encontrada.` });
      if (partida.encerrada) return res.status(400).json({ error: `A partida ${p.partidaId} já foi encerrada.` });

      if (!abertaParaPalpite(partida)) {
        return res.status(400).json({
          error: `Palpites para esta partida encerram 10 minutos antes do início (${partida.dataHora.toLocaleString('pt-BR')}).`,
        });
      }

      if (!['CASA', 'FORA', 'EMPATE'].includes(p.resultado)) {
        return res.status(400).json({ error: 'Resultado inválido. Use CASA, FORA ou EMPATE.' });
      }
    }

    // ── Regra do BILHETE ─────────────────────────────────────────
    // O valor do bilhete é fixo (campanha.valorPalpite = R$10,00),
    // independentemente de quantos jogos o palpiteiro escolher.
    // Cada PalpitePartida recebe valorPago = 0 (sem custo individual),
    // exceto o primeiro que recebe o valor total do bilhete — assim
    // o totalArrecadado da campanha é calculado corretamente.
    const valorBilhete = Number(campanha.valorPalpite); // R$10,00 fixo

    const criados = await prisma.$transaction(
      palpites.map((p, idx) =>
        prisma.palpitePartida.upsert({
          where: {
            usuario_partida_unico: { usuarioId, partidaId: Number(p.partidaId) },
          },
          update: {
            palpiteResultado: p.resultado,
            valorPago:        idx === 0 ? valorBilhete : 0, // bilhete cobrado uma vez
          },
          create: {
            usuarioId,
            partidaId:        Number(p.partidaId),
            palpiteResultado: p.resultado,
            valorPago:        idx === 0 ? valorBilhete : 0, // bilhete cobrado uma vez
          },
        })
      )
    );

    return res.status(201).json({
      mensagem:    `Bilhete registrado! ${criados.length} jogo(s) escolhido(s). Total: R$ ${valorBilhete.toFixed(2)}`,
      palpites:    criados.map(c => ({ id: c.id, partidaId: c.partidaId, resultado: c.palpiteResultado })),
      totalPago:   valorBilhete.toFixed(2),
      quantJogos:  criados.length,
      campanhaId:  campanha.id,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar palpites.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  GET /api/partidas/meus-palpites?campanhaId=3
// ══════════════════════════════════════════════════════════════
async function meusPalpites(req, res) {
  const usuarioId = req.user.id;
  const { campanhaId } = req.query;

  try {
    const palpites = await prisma.palpitePartida.findMany({
      where: {
        usuarioId,
        ...(campanhaId ? { partida: { campanhaId: Number(campanhaId) } } : {}),
      },
      include: {
        partida: {
          include: {
            selecaoCasa: { select: { nome: true, sigla: true, bandeiraCss: true } },
            selecaoFora: { select: { nome: true, sigla: true, bandeiraCss: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    });

    return res.json(palpites.map(p => ({
      id:        p.id,
      partidaId: p.partidaId,
      dataHora:  p.partida.dataHora,
      casa:      { nome: p.partida.selecaoCasa.nome, sigla: p.partida.selecaoCasa.sigla },
      fora:      { nome: p.partida.selecaoFora.nome, sigla: p.partida.selecaoFora.sigla },
      palpite:   p.palpiteResultado,
      resultadoReal: p.partida.resultado,
      encerrada: p.partida.encerrada,
      acertou:   p.acertou,
      pontos:    p.pontos,
      valorPago: Number(p.valorPago).toFixed(2),
      pago:      p.pagamentoConfirmado,
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar seus palpites.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  GET /api/partidas/ranking-pontuacao?campanhaId=3
//  Ranking acumulado de pontos (3 por acerto) — usado para o
//  rateio final dos 3 maiores pontuadores
// ══════════════════════════════════════════════════════════════
async function rankingPontuacao(req, res) {
  const { campanhaId } = req.query;
  if (!campanhaId) return res.status(400).json({ error: 'Informe campanhaId.' });

  try {
    const dados = await prisma.palpitePartida.groupBy({
      by:     ['usuarioId'],
      where:  { partida: { campanhaId: Number(campanhaId) } },
      _sum:   { pontos: true },
      _count: { id: true },
    });

    const ids = dados.map(d => d.usuarioId);
    const usuarios = await prisma.usuario.findMany({
      where:  { id: { in: ids } },
      select: { id: true, apelido: true, codigoCdp: true },
    });
    const mapaUsuarios = Object.fromEntries(usuarios.map(u => [u.id, u]));

    const resultado = dados
      .map(d => ({
        usuarioId:   d.usuarioId,
        apelido:     mapaUsuarios[d.usuarioId]?.apelido ?? '-',
        codigoCdp:   mapaUsuarios[d.usuarioId]?.codigoCdp ?? '-',
        totalPontos: d._sum.pontos ?? 0,
        totalPalpites: d._count.id,
      }))
      .sort((a, b) => b.totalPontos - a.totalPontos)
      .map((r, i, arr) => {
        // Calcula posição considerando empates (mesma posição para mesma pontuação)
        const posicao = arr.findIndex(x => x.totalPontos === r.totalPontos) + 1;
        return { ...r, posicao };
      });

    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar ranking de pontuação.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  ADMIN — POST /api/admin/partidas
//  Cadastra uma nova partida
//  Body: { campanhaId, selecaoCasaId, selecaoForaId, dataHora, grupo }
// ══════════════════════════════════════════════════════════════
async function criarPartida(req, res) {
  const { campanhaId, selecaoCasaId, selecaoForaId, dataHora, grupo } = req.body;
  if (!campanhaId || !selecaoCasaId || !selecaoForaId || !dataHora || !grupo) {
    return res.status(400).json({ error: 'Preencha todos os campos da partida.' });
  }
  try {
    const partida = await prisma.partida.create({
      data: {
        campanhaId:    Number(campanhaId),
        selecaoCasaId: Number(selecaoCasaId),
        selecaoForaId: Number(selecaoForaId),
        dataHora:      new Date(dataHora),
        grupo,
      },
    });
    return res.status(201).json(partida);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar partida.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  ADMIN — PATCH /api/admin/partidas/:id/resultado
//  Define o resultado da partida e processa a pontuação
//  Body: { resultado: 'CASA'|'FORA'|'EMPATE' }
// ══════════════════════════════════════════════════════════════
async function definirResultado(req, res) {
  const { id } = req.params;
  const { resultado } = req.body;

  if (!['CASA', 'FORA', 'EMPATE'].includes(resultado)) {
    return res.status(400).json({ error: 'Resultado inválido. Use CASA, FORA ou EMPATE.' });
  }

  try {
    const partida = await prisma.partida.findUnique({ where: { id: Number(id) } });
    if (!partida) return res.status(404).json({ error: 'Partida não encontrada.' });
    if (partida.encerrada) return res.status(400).json({ error: 'Esta partida já foi encerrada.' });

    // Busca todos os palpites dessa partida
    const palpites = await prisma.palpitePartida.findMany({ where: { partidaId: partida.id } });

    await prisma.$transaction([
      // Atualiza a partida
      prisma.partida.update({
        where: { id: partida.id },
        data:  { resultado, encerrada: true },
      }),
      // Atualiza cada palpite: acertou + pontos
      ...palpites.map(p => {
        const acertou = p.palpiteResultado === resultado;
        return prisma.palpitePartida.update({
          where: { id: p.id },
          data:  { acertou, pontos: acertou ? PONTOS_POR_ACERTO : 0 },
        });
      }),
    ]);

    const totalAcertos = palpites.filter(p => p.palpiteResultado === resultado).length;

    return res.json({
      mensagem: `Resultado definido: ${resultado}. ${totalAcertos} de ${palpites.length} palpiteiro(s) acertaram (+${PONTOS_POR_ACERTO} pts).`,
      totalPalpites: palpites.length,
      totalAcertos,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao definir resultado.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  ADMIN — POST /api/admin/partidas/apurar-campanha
//  Body: { campanhaId }
//  Calcula o rateio final: 60% do total arrecadado dividido entre
//  os 3 maiores pontuadores (30% / 20% / 10%), com empates divididos.
//  Requer que TODAS as partidas da campanha estejam encerradas.
// ══════════════════════════════════════════════════════════════
async function apurarCampanha(req, res) {
  const { campanhaId } = req.body;
  if (!campanhaId) return res.status(400).json({ error: 'Informe campanhaId.' });

  try {
    const campanha = await prisma.campanha.findUnique({ where: { id: Number(campanhaId) } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });
    if (campanha.tipo !== 'PALPITE_RESULTADO') {
      return res.status(400).json({ error: 'Apuração disponível apenas para campanha de palpite por resultado.' });
    }

    // Confirma que todas as partidas estão encerradas
    const partidas = await prisma.partida.findMany({ where: { campanhaId: campanha.id } });
    const pendentes = partidas.filter(p => !p.encerrada);
    if (pendentes.length > 0) {
      return res.status(400).json({ error: `Ainda há ${pendentes.length} partida(s) sem resultado definido.` });
    }

    // Total arrecadado = soma de todos os palpites pagos nesta campanha
    const palpites = await prisma.palpitePartida.findMany({
      where: { partida: { campanhaId: campanha.id }, pagamentoConfirmado: true },
    });
    const totalArrecadado = palpites.reduce((s, p) => s + Number(p.valorPago), 0);

    if (totalArrecadado === 0) {
      return res.status(400).json({ error: 'Nenhum palpite pago encontrado nesta campanha.' });
    }

    const fundoPremios = totalArrecadado * (Number(campanha.percPremio) / 100); // 60%
    const fundoClube   = totalArrecadado * (Number(campanha.percClube)  / 100); // 40%

    // Percentuais sobre o TOTAL ARRECADADO para cada posição do pódio
    const PERC_1 = 0.30, PERC_2 = 0.20, PERC_3 = 0.10;

    // Ranking de pontuação (igual ao endpoint rankingPontuacao)
    const dados = await prisma.palpitePartida.groupBy({
      by:    ['usuarioId'],
      where: { partida: { campanhaId: campanha.id } },
      _sum:  { pontos: true },
    });

    const ranking = dados
      .map(d => ({ usuarioId: d.usuarioId, totalPontos: d._sum.pontos ?? 0 }))
      .filter(r => r.totalPontos > 0)
      .sort((a, b) => b.totalPontos - a.totalPontos);

    if (ranking.length === 0) {
      return res.status(400).json({ error: 'Nenhum palpiteiro pontuou nesta campanha.' });
    }

    // Agrupa por pontuação (para tratar empates)
    const pontuacoesUnicas = [...new Set(ranking.map(r => r.totalPontos))].sort((a, b) => b - a);

    // Define as 3 "posições" do pódio e seus percentuais
    const posicoes = [
      { pos: 1, perc: PERC_1 },
      { pos: 2, perc: PERC_2 },
      { pos: 3, perc: PERC_3 },
    ];

    // Para cada uma das 3 posições do pódio, identifica o grupo de pontuação correspondente
    // (1ª posição = maior pontuação, 2ª = segunda maior distinta, 3ª = terceira maior distinta)
    const premiacoes = []; // { usuarioId, posicao, valor }

    for (const { pos, perc } of posicoes) {
      const pontosDaPosicao = pontuacoesUnicas[pos - 1];
      if (pontosDaPosicao === undefined) continue; // não há pontuadores suficientes

      const empatados = ranking.filter(r => r.totalPontos === pontosDaPosicao);
      const valorPosicao = fundoPremios * perc;
      const valorPorPessoa = valorPosicao / empatados.length;

      for (const e of empatados) {
        premiacoes.push({
          usuarioId: e.usuarioId,
          posicao: pos,
          pontos: pontosDaPosicao,
          valor: valorPorPessoa,
          dividioCom: empatados.length,
        });
      }
    }

    // Consolida premiações por usuário (caso ele apareça em mais de uma posição — não deveria, mas por segurança)
    const premioPorUsuario = {};
    for (const p of premiacoes) {
      premioPorUsuario[p.usuarioId] = (premioPorUsuario[p.usuarioId] ?? 0) + p.valor;
    }

    // Persiste: marca campanha como inativa e credita prêmios na conta corrente de cada ganhador
    await prisma.$transaction(async (tx) => {
      await tx.campanha.update({ where: { id: campanha.id }, data: { ativa: false } });

      for (const [usuarioIdStr, valor] of Object.entries(premioPorUsuario)) {
        const usuarioId = Number(usuarioIdStr);
        let conta = await tx.contaCorrente.findUnique({ where: { usuarioId } });
        if (!conta) conta = await tx.contaCorrente.create({ data: { usuarioId } });

        await tx.contaCorrente.update({
          where: { id: conta.id },
          data:  { saldo: { increment: valor }, totalGanho: { increment: valor } },
        });
        await tx.movimentoConta.create({
          data: {
            contaId:   conta.id,
            tipo:      'COMISSAO_PALPITE',
            valor,
            descricao: `Premiação Palpite por Resultado · Campanha "${campanha.nome}"`,
          },
        });
      }
    });

    // Busca apelidos para retorno
    const idsGanhadores = Object.keys(premioPorUsuario).map(Number);
    const usuarios = await prisma.usuario.findMany({
      where:  { id: { in: idsGanhadores } },
      select: { id: true, apelido: true, codigoCdp: true },
    });
    const mapaUsuarios = Object.fromEntries(usuarios.map(u => [u.id, u]));

    return res.json({
      mensagem: 'Campanha apurada com sucesso!',
      totalArrecadado: totalArrecadado.toFixed(2),
      fundoClube:      fundoClube.toFixed(2),
      fundoPremios:    fundoPremios.toFixed(2),
      premiacoes: premiacoes.map(p => ({
        usuarioId:  p.usuarioId,
        apelido:    mapaUsuarios[p.usuarioId]?.apelido ?? '-',
        codigoCdp:  mapaUsuarios[p.usuarioId]?.codigoCdp ?? '-',
        posicao:    p.posicao,
        pontos:     p.pontos,
        valor:      p.valor.toFixed(2),
        divididoEntre: p.dividioCom,
      })),
    });
  } catch (err) {
    console.error('[PARTIDA] Erro ao apurar campanha:', err.message);
    return res.status(500).json({ error: 'Erro ao apurar campanha.' });
  }
}

module.exports = {
  listar,
  palpitar,
  meusPalpites,
  rankingPontuacao,
  criarPartida,
  definirResultado,
  apurarCampanha,
  abertaParaPalpite, // exportada para uso no pagamento.controller (validação do bilhete)
};
