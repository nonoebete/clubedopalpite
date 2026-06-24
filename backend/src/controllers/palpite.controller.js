// src/controllers/palpite.controller.js
const prisma = require('../models/prisma');

// ── Verifica se uma campanha está aberta no momento ────────────
function campanhaAberta(campanha) {
  const agora = new Date();
  return campanha.ativa && agora >= campanha.inicio && agora <= campanha.fim;
}

// ── POST /api/palpites — Registrar um ou mais palpites ─────────
// Body: { campanhaId, palpites: [ { selecaoCampeaId, selecaoViceId? } ] }
async function registrar(req, res) {
  const { campanhaId, palpites } = req.body;
  const usuarioId = req.user.id;

  if (!campanhaId || !Array.isArray(palpites) || palpites.length === 0) {
    return res.status(400).json({ error: 'Informe campanhaId e ao menos um palpite.' });
  }

  try {
    // Busca a campanha
    const campanha = await prisma.campanha.findUnique({ where: { id: Number(campanhaId) } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });
    if (!campanhaAberta(campanha)) {
      return res.status(400).json({ error: 'Esta campanha não está aberta para novos palpites.' });
    }

    // Valida regras por tipo de campanha
    for (const p of palpites) {
      if (!p.selecaoCampeaId) {
        return res.status(400).json({ error: 'Informe selecaoCampeaId em todos os palpites.' });
      }
      if (campanha.tipo === 'CAMPEA_VICE') {
        if (!p.selecaoViceId) {
          return res.status(400).json({ error: 'Na 2ª fase, informe também selecaoViceId.' });
        }
        if (p.selecaoCampeaId === p.selecaoViceId) {
          return res.status(400).json({ error: 'Campeã e vice-campeã não podem ser a mesma seleção.' });
        }
      }
    }

    // Insere todos os palpites em transação
    const valorUnitario = Number(campanha.valorPalpite);
    const criados = await prisma.$transaction(
      palpites.map(p =>
        prisma.palpiteCampanha.create({
          data: {
            usuarioId,
            campanhaId: campanha.id,
            selecaoCampeaId: Number(p.selecaoCampeaId),
            selecaoViceId:   p.selecaoViceId ? Number(p.selecaoViceId) : null,
            valorPago:       valorUnitario,
          },
        })
      )
    );

    const totalPago = (criados.length * valorUnitario).toFixed(2);

    return res.status(201).json({
      mensagem:      `${criados.length} palpite(s) registrado(s) com sucesso!`,
      totalPago:     `R$ ${totalPago}`,
      quantPalpites: criados.length,
      ids:           criados.map(p => p.id),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao registrar palpites.' });
  }
}

// ── GET /api/palpites/meus — Listar palpites do usuário logado ─
async function meusPalpites(req, res) {
  try {
    const palpites = await prisma.palpiteCampanha.findMany({
      where:   { usuarioId: req.user.id },
      include: {
        campanha:     { select: { nome: true, fase: true, tipo: true } },
        selecaoCampea: { select: { nome: true, bandeiraCss: true } },
        selecaoVice:  { select: { nome: true, bandeiraCss: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });

    return res.json(palpites);
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar palpites.' });
  }
}

// ── GET /api/palpites/ranking — Ranking geral por pontos ───────
async function ranking(req, res) {
  try {
    const dados = await prisma.palpiteCampanha.groupBy({
      by:     ['usuarioId'],
      where:  { acertou: true },
      _count: { acertou: true },
      _sum:   { premioRecebido: true },
      orderBy: { _count: { acertou: 'desc' } },
      take:   20,
    });

    // Busca apelidos
    const ids = dados.map(d => d.usuarioId);
    const usuarios = await prisma.usuario.findMany({
      where:  { id: { in: ids } },
      select: { id: true, apelido: true, codigoCdp: true },
    });
    const mapaUsuarios = Object.fromEntries(usuarios.map(u => [u.id, u]));

    const resultado = dados.map((d, i) => ({
      posicao:        i + 1,
      apelido:        mapaUsuarios[d.usuarioId]?.apelido ?? '-',
      codigoCdp:      mapaUsuarios[d.usuarioId]?.codigoCdp ?? '-',
      acertos:        d._count.acertou,
      premioTotal:    Number(d._sum.premioRecebido ?? 0).toFixed(2),
    }));

    return res.json(resultado);
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar ranking.' });
  }
}

// GET /api/palpites/ranking-selecoes — seleções mais palpitadas (público)
async function rankingSelecoes(req, res) {
  try {
    const dados = await prisma.palpiteCampanha.groupBy({
      by: ['selecaoCampeaId'],
      where: { pagamentoConfirmado: true },
      _count: { selecaoCampeaId: true },
      orderBy: { _count: { selecaoCampeaId: 'desc' } },
    });

    const ids = dados.map(d => d.selecaoCampeaId);
    const selecoes = await prisma.selecao.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, sigla: true, bandeiraCss: true, grupo: true },
    });
    const mapaSelecoes = Object.fromEntries(selecoes.map(s => [s.id, s]));

    // Total geral de palpites para calcular percentual
    const total = dados.reduce((s, d) => s + d._count.selecaoCampeaId, 0);

    const resultado = dados.map((d, i) => {
      const sel = mapaSelecoes[d.selecaoCampeaId] || {};
      return {
        posicao:    i + 1,
        id:         d.selecaoCampeaId,
        nome:       sel.nome || '—',
        sigla:      sel.sigla || '—',
        bandeiraCss: sel.bandeiraCss || '',
        grupo:      sel.grupo || '—',
        palpites:   d._count.selecaoCampeaId,
        percentual: total > 0 ? ((d._count.selecaoCampeaId / total) * 100).toFixed(1) : '0.0',
      };
    });

    return res.json({ total, selecoes: resultado });
  } catch (err) {
    console.error('[rankingSelecoes]', err);
    return res.status(500).json({ error: 'Erro ao buscar ranking de seleções.' });
  }
}

// GET /api/palpites/ranking-por-fase?fase=1|2|3|0 — ranking por fase (público)
async function rankingPorFase(req, res) {
  try {
    const fase = req.query.fase ? Number(req.query.fase) : null;

    let resultado = [];

    if (fase === 3) {
      // ── 3ª Fase: usa tabela palpitesPartida ──────────────────
      const dados = await prisma.palpitePartida.groupBy({
        by: ['usuarioId'],
        where: { pagamentoConfirmado: true },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      });
      const ids = dados.map(d => d.usuarioId);
      const usuarios = await prisma.usuario.findMany({
        where: { id: { in: ids } },
        select: { id: true, apelido: true, codigoCdp: true },
      });
      const mapaUsu = Object.fromEntries(usuarios.map(u => [u.id, u]));
      resultado = dados.map((d, i) => ({
        posicao:   i + 1,
        apelido:   mapaUsu[d.usuarioId]?.apelido   || '—',
        codigoCdp: mapaUsu[d.usuarioId]?.codigoCdp || '—',
        palpites:  d._count.id,
        investido: d._count.id * 10,
      }));

    } else {
      // ── Fases 1, 2 ou Geral (0): usa palpitesCampanha ────────
      const where = { pagamentoConfirmado: true };
      if (fase && fase !== 0) {
        // Pega a campanha com mais palpites (evita pegar campanha vazia quando há duplicatas de fase)
        const campanhas = await prisma.campanha.findMany({ where: { fase } });
        if (campanhas.length > 0) {
          // Conta palpites por campanha e pega a com mais
          const conts = await Promise.all(campanhas.map(async c => ({
            id: c.id,
            total: await prisma.palpiteCampanha.count({ where: { campanhaId: c.id, pagamentoConfirmado: true } })
          })));
          const melhor = conts.sort((a,b) => b.total - a.total)[0];
          where.campanhaId = melhor.id;
        }
      }

      const dados = await prisma.palpiteCampanha.groupBy({
        by: ['usuarioId'],
        where,
        _count: { id: true },
        _sum:   { valorPago: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      });

      // Para o Geral (fase=0), soma também os palpitesPartida
      let extraPorUsuario = {};
      if (!fase || fase === 0) {
        const extras = await prisma.palpitePartida.groupBy({
          by: ['usuarioId'],
          where: { pagamentoConfirmado: true },
          _count: { id: true },
        });
        extraPorUsuario = Object.fromEntries(extras.map(e => [e.usuarioId, e._count.id]));
      }

      const ids = [...new Set([...dados.map(d => d.usuarioId), ...Object.keys(extraPorUsuario).map(Number)])];
      const usuarios = await prisma.usuario.findMany({
        where:  { id: { in: ids } },
        select: { id: true, apelido: true, codigoCdp: true },
      });
      const mapaUsu = Object.fromEntries(usuarios.map(u => [u.id, u]));

      // Mescla palpitesCampanha + palpitesPartida para o geral
      const mergeMap = {};
      dados.forEach(d => {
        mergeMap[d.usuarioId] = {
          palpites:  d._count.id + (extraPorUsuario[d.usuarioId] || 0),
          investido: Number(d._sum.valorPago || 0) + (extraPorUsuario[d.usuarioId] || 0) * 10,
        };
      });
      Object.entries(extraPorUsuario).forEach(([uid, cnt]) => {
        if (!mergeMap[uid]) mergeMap[uid] = { palpites: cnt, investido: cnt * 10 };
      });

      resultado = Object.entries(mergeMap)
        .map(([uid, v]) => ({
          usuarioId: Number(uid),
          ...v,
          apelido:   mapaUsu[uid]?.apelido   || '—',
          codigoCdp: mapaUsu[uid]?.codigoCdp || '—',
        }))
        .sort((a, b) => b.palpites - a.palpites)
        .slice(0, 20)
        .map((r, i) => ({ ...r, posicao: i + 1 }));
    }

    return res.json(resultado);
  } catch (err) {
    console.error('[rankingPorFase]', err);
    return res.status(500).json({ error: 'Erro ao buscar ranking por fase.' });
  }
}

module.exports = { registrar, meusPalpites, ranking, rankingSelecoes, rankingPorFase };
