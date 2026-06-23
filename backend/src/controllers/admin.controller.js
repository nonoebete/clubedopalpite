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
        apelido: true, telefone: true, perfil: true, bloqueado: true, criadoEm: true,
        cep: true, endereco: true, bairro: true, cidade: true, estado: true,
        _count: { select: { palpites: true, pagamentos: true } },
      },
      orderBy: { id: 'asc' },
    });
    return res.json(usuarios);
  } catch {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
}

// ── PUT /api/admin/usuarios/:id — Edita dados de um membro ────
async function editarUsuario(req, res) {
  const { id } = req.params;
  const { nomeCompleto, apelido, telefone } = req.body;

  if (!nomeCompleto || !apelido || !telefone) {
    return res.status(400).json({ error: 'Preencha nome completo, apelido e telefone.' });
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id: Number(id) },
      data: { nomeCompleto: nomeCompleto.trim(), apelido: apelido.trim(), telefone: telefone.trim() },
    });
    return res.json({ mensagem: 'Dados atualizados com sucesso.', usuario: {
      id: usuario.id, codigoCdp: usuario.codigoCdp, nomeCompleto: usuario.nomeCompleto,
      apelido: usuario.apelido, telefone: usuario.telefone,
    }});
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Membro não encontrado.' });
    console.error(err);
    return res.status(500).json({ error: 'Erro ao editar membro.' });
  }
}

// ── PATCH /api/admin/usuarios/:id/bloqueio — Bloqueia/desbloqueia ──
async function alternarBloqueio(req, res) {
  const { id } = req.params;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
    if (!usuario) return res.status(404).json({ error: 'Membro não encontrado.' });
    if (usuario.perfil === 'ADMIN') return res.status(400).json({ error: 'Não é possível bloquear um administrador.' });

    const atualizado = await prisma.usuario.update({
      where: { id: Number(id) },
      data:  { bloqueado: !usuario.bloqueado },
    });

    return res.json({
      mensagem: atualizado.bloqueado ? 'Membro bloqueado.' : 'Membro desbloqueado.',
      bloqueado: atualizado.bloqueado,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao alterar bloqueio.' });
  }
}

// ── POST /api/admin/usuarios/:id/resetar-senha ─────────────────
async function resetarSenha(req, res) {
  const { id } = req.params;
  const bcrypt = require('bcryptjs');

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
    if (!usuario) return res.status(404).json({ error: 'Membro não encontrado.' });

    const primeiroNome = usuario.nomeCompleto
      .trim().split(' ')[0]
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().slice(0, 3);
    const novaSenha = primeiroNome + '123';
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: Number(id) },
      data:  { senhaHash: novaSenhaHash },
    });

    // TODO: integrar envio via WhatsApp (Evolution API) com a nova senha
    return res.json({ mensagem: 'Senha redefinida com sucesso.', novaSenha });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao resetar senha.' });
  }
}

// ── DELETE /api/admin/usuarios/:id — Exclui um membro ──────────
// Só permite excluir membros SEM pagamentos confirmados, para
// proteger dados financeiros reais. Remove em cascata os registros
// de teste vinculados (palpites pendentes, conta corrente, etc).
async function excluirUsuario(req, res) {
  const { id } = req.params;
  const usuarioId = Number(id);

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: { _count: { select: { pagamentos: true } } },
    });
    if (!usuario) return res.status(404).json({ error: 'Membro não encontrado.' });
    if (usuario.perfil === 'ADMIN') return res.status(400).json({ error: 'Não é possível excluir um administrador.' });

    const pagamentosConfirmados = await prisma.pagamento.count({
      where: { usuarioId, status: 'APROVADO' },
    });
    if (pagamentosConfirmados > 0) {
      return res.status(400).json({
        error: 'Este membro possui pagamentos confirmados e não pode ser excluído. Use "Bloquear" para impedir novos acessos.',
      });
    }

    await prisma.$transaction(async (tx) => {
      const conta = await tx.contaCorrente.findUnique({ where: { usuarioId } });
      if (conta) {
        await tx.movimentoConta.deleteMany({ where: { contaId: conta.id } });
      }
      await tx.palpiteCampanha.deleteMany({ where: { usuarioId } });
      await tx.palpitePartida.deleteMany({ where: { usuarioId } });
      await tx.pagamento.deleteMany({ where: { usuarioId } });
      await tx.resgate.deleteMany({ where: { usuarioId } });
      if (conta) await tx.contaCorrente.delete({ where: { usuarioId } });
      await tx.indicacao.deleteMany({ where: { OR: [{ indicadorId: usuarioId }, { indicadoId: usuarioId }] } });
      await tx.usuario.delete({ where: { id: usuarioId } });
    });

    return res.json({ mensagem: `Membro ${usuario.codigoCdp} excluído com sucesso.` });
  } catch (err) {
    console.error('[Excluir usuário]', err);
    return res.status(500).json({ error: 'Erro ao excluir membro.' });
  }
}

module.exports = { apurar, financeiro, listarUsuarios, editarUsuario, alternarBloqueio, resetarSenha, excluirUsuario };
