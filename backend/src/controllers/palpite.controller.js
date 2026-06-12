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

module.exports = { registrar, meusPalpites, ranking };
