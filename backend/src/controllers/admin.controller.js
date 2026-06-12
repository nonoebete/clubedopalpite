// src/controllers/admin.controller.js
const prisma = require('../models/prisma');

// ── POST /api/admin/apurar — Apura resultado de uma campanha ───
// Body: { campanhaId, selecaoCampeaId, selecaoViceId? }
async function apurar(req, res) {
  const { campanhaId, selecaoCampeaId, selecaoViceId } = req.body;

  if (!campanhaId || !selecaoCampeaId) {
    return res.status(400).json({ error: 'Informe campanhaId e selecaoCampeaId.' });
  }

  try {
    const campanha = await prisma.campanha.findUnique({ where: { id: Number(campanhaId) } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });

    // Busca todos os palpites desta campanha
    const todosPalpites = await prisma.palpiteCampanha.findMany({
      where: { campanhaId: campanha.id },
    });

    if (todosPalpites.length === 0) {
      return res.status(400).json({ error: 'Nenhum palpite registrado nesta campanha.' });
    }

    // Identifica acertadores
    const acertadores = todosPalpites.filter(p => {
      if (campanha.tipo === 'CAMPEA') {
        return p.selecaoCampeaId === Number(selecaoCampeaId);
      }
      // CAMPEA_VICE: ordem importa
      return (
        p.selecaoCampeaId === Number(selecaoCampeaId) &&
        p.selecaoViceId   === Number(selecaoViceId)
      );
    });

    // Cálculo financeiro
    const totalArrecadado = todosPalpites.reduce((s, p) => s + Number(p.valorPago), 0);
    const fundoPremio     = totalArrecadado * (Number(campanha.percPremio) / 100);
    const lucroClube      = totalArrecadado * (Number(campanha.percClube)  / 100);
    const premioPorAcertador = acertadores.length > 0
      ? fundoPremio / acertadores.length
      : 0;

    // Atualiza todos os palpites: acertou true/false + prêmio
    await prisma.$transaction([
      // Marca erros
      prisma.palpiteCampanha.updateMany({
        where: {
          campanhaId: campanha.id,
          id: { notIn: acertadores.map(a => a.id) },
        },
        data: { acertou: false, premioRecebido: 0 },
      }),
      // Marca acertos com prêmio
      ...acertadores.map(a =>
        prisma.palpiteCampanha.update({
          where: { id: a.id },
          data:  { acertou: true, premioRecebido: premioPorAcertador },
        })
      ),
      // Encerra a campanha
      prisma.campanha.update({
        where: { id: campanha.id },
        data:  { ativa: false },
      }),
    ]);

    return res.json({
      mensagem:            'Campanha apurada com sucesso!',
      campanha:            campanha.nome,
      totalPalpites:       todosPalpites.length,
      totalArrecadado:     `R$ ${totalArrecadado.toFixed(2)}`,
      lucroClube:          `R$ ${lucroClube.toFixed(2)}`,
      fundoPremio:         `R$ ${fundoPremio.toFixed(2)}`,
      qtdAcertadores:      acertadores.length,
      premioPorAcertador:  `R$ ${premioPorAcertador.toFixed(2)}`,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao apurar campanha.' });
  }
}

// ── GET /api/admin/financeiro — Resumo financeiro geral ────────
async function financeiro(req, res) {
  try {
    const campanhas = await prisma.campanha.findMany({
      include: { _count: { select: { palpites: true } } },
    });

    const resultado = await Promise.all(
      campanhas.map(async (c) => {
        const agg = await prisma.palpiteCampanha.aggregate({
          where:   { campanhaId: c.id },
          _sum:    { valorPago: true, premioRecebido: true },
          _count:  { id: true },
        });

        const acertos = await prisma.palpiteCampanha.count({
          where: { campanhaId: c.id, acertou: true },
        });

        const total       = Number(agg._sum.valorPago ?? 0);
        const fundoPremio = total * (Number(c.percPremio) / 100);
        const lucroClube  = total * (Number(c.percClube)  / 100);

        return {
          campanha:           c.nome,
          fase:               c.fase,
          ativa:              c.ativa,
          totalPalpites:      agg._count.id,
          totalArrecadado:    `R$ ${total.toFixed(2)}`,
          lucroClube:         `R$ ${lucroClube.toFixed(2)}`,
          fundoPremio:        `R$ ${fundoPremio.toFixed(2)}`,
          qtdAcertadores:     acertos,
          premioPorAcertador: acertos > 0 ? `R$ ${(fundoPremio / acertos).toFixed(2)}` : 'Aguardando apuração',
        };
      })
    );

    return res.json(resultado);
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar financeiro.' });
  }
}

// ── GET /api/admin/usuarios — Lista todos os usuários ─────────
async function listarUsuarios(req, res) {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true, codigoCdp: true, nomeCompleto: true,
        apelido: true, telefone: true, perfil: true, criadoEm: true,
        _count: { select: { palpites: true } },
      },
      orderBy: { id: 'asc' },
    });
    return res.json(usuarios);
  } catch {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
}

module.exports = { apurar, financeiro, listarUsuarios };
