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

    const todosPalpites = await prisma.palpiteCampanha.findMany({
      where: { campanhaId: campanha.id, pagamentoConfirmado: true },
      include: {
        usuario: { select: { id: true, codigoCdp: true, nomeCompleto: true, telefone: true } },
      },
    });

    if (todosPalpites.length === 0) {
      return res.status(400).json({ error: 'Nenhum palpite registrado nesta campanha.' });
    }

    // Identifica acertadores (SEM salvar no banco ainda)
    const acertadores = todosPalpites.filter(p => {
      if (campanha.tipo === 'CAMPEA') {
        return p.selecaoCampeaId === Number(selecaoCampeaId);
      }
      return (
        p.selecaoCampeaId === Number(selecaoCampeaId) &&
        p.selecaoViceId   === Number(selecaoViceId)
      );
    });

    const totalArrecadado    = todosPalpites.reduce((s, p) => s + Number(p.valorPago), 0);
    const fundoPremio        = totalArrecadado * (Number(campanha.percPremio) / 100);
    const lucroClube         = totalArrecadado * (Number(campanha.percClube)  / 100);
    const premioPorAcertador = acertadores.length > 0 ? fundoPremio / acertadores.length : 0;

    // Retorna resultado SEM salvar — admin decide se confirma
    return res.json({
      mensagem:            'Apuração calculada! Confirme os dados antes de encerrar.',
      campanha:            campanha.nome,
      campanhaId:          campanha.id,
      selecaoCampeaId:     Number(selecaoCampeaId),
      selecaoViceId:       selecaoViceId ? Number(selecaoViceId) : null,
      totalPalpites:       todosPalpites.length,
      totalArrecadado:     `R$ ${totalArrecadado.toFixed(2)}`,
      lucroClube:          `R$ ${lucroClube.toFixed(2)}`,
      fundoPremio:         `R$ ${fundoPremio.toFixed(2)}`,
      qtdAcertadores:      acertadores.length,
      premioPorAcertador:  `R$ ${premioPorAcertador.toFixed(2)}`,
      acertadores: acertadores.map(a => ({
        palpiteId:    a.id,
        codigoCdp:    a.usuario?.codigoCdp || '—',
        nomeCompleto: a.usuario?.nomeCompleto || '—',
        telefone:     a.usuario?.telefone || '—',
        premio:       `R$ ${premioPorAcertador.toFixed(2)}`,
      })),
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
          id:                 c.id,
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

// ── POST /api/admin/campanhas/:id/encerrar — Confirma apuração e encerra ──
async function encerrarCampanha(req, res) {
  const { id } = req.params;
  const { selecaoCampeaId, selecaoViceId } = req.body;

  try {
    const campanha = await prisma.campanha.findUnique({ where: { id: Number(id) } });
    if (!campanha) return res.status(404).json({ error: 'Campanha não encontrada.' });

    const todosPalpites = await prisma.palpiteCampanha.findMany({
      where: { campanhaId: Number(id), pagamentoConfirmado: true },
    });

    const acertadores = todosPalpites.filter(p => {
      if (campanha.tipo === 'CAMPEA') return p.selecaoCampeaId === Number(selecaoCampeaId);
      return p.selecaoCampeaId === Number(selecaoCampeaId) && p.selecaoViceId === Number(selecaoViceId);
    });

    const totalArrecadado    = todosPalpites.reduce((s, p) => s + Number(p.valorPago), 0);
    const fundoPremio        = totalArrecadado * (Number(campanha.percPremio) / 100);
    const premioPorAcertador = acertadores.length > 0 ? fundoPremio / acertadores.length : 0;

    // Agora sim salva no banco e encerra a campanha
    await prisma.$transaction([
      prisma.palpiteCampanha.updateMany({
        where: { campanhaId: Number(id), id: { notIn: acertadores.map(a => a.id) } },
        data:  { acertou: false, premioRecebido: 0 },
      }),
      ...acertadores.map(a =>
        prisma.palpiteCampanha.update({
          where: { id: a.id },
          data:  { acertou: true, premioRecebido: premioPorAcertador },
        })
      ),
      prisma.campanha.update({
        where: { id: Number(id) },
        data:  { ativa: false },
      }),
    ]);

    return res.json({
      mensagem: `Campanha "${campanha.nome}" encerrada e prêmios distribuídos!`,
      qtdAcertadores: acertadores.length,
      premioPorAcertador: `R$ ${premioPorAcertador.toFixed(2)}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao encerrar campanha.' });
  }
}

module.exports = { apurar, financeiro, listarUsuarios, editarUsuario, alternarBloqueio, resetarSenha, excluirUsuario, listarTodosPalpites, excluirPalpite, confirmarPalpiteManual, reenviarPalpite, encerrarCampanha };

// ── GET /api/admin/palpites — Lista todos os palpites ───────────
async function listarTodosPalpites(req, res) {
  try {
    const palpites = await prisma.palpiteCampanha.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        usuario:      { select: { id: true, codigoCdp: true, nomeCompleto: true, apelido: true, telefone: true } },
        campanha:     { select: { nome: true, fase: true } },
        selecaoCampea:{ select: { nome: true, bandeiraCss: true } },
        selecaoVice:  { select: { nome: true, bandeiraCss: true } },
      },
    });
    return res.json(palpites);
  } catch (err) {
    console.error('[Admin] listarTodosPalpites:', err);
    return res.status(500).json({ error: 'Erro ao listar palpites.' });
  }
}

// ── DELETE /api/admin/palpites/:id — Exclui palpite ────────────
async function excluirPalpite(req, res) {
  const { id } = req.params;
  try {
    const p = await prisma.palpiteCampanha.findUnique({ where: { id: Number(id) } });
    if (!p) return res.status(404).json({ error: 'Palpite não encontrado.' });
    if (p.pagamentoConfirmado) {
      return res.status(400).json({ error: 'Não é possível excluir palpites com pagamento confirmado.' });
    }
    await prisma.palpiteCampanha.delete({ where: { id: Number(id) } });
    return res.json({ mensagem: `Palpite #${id} excluído com sucesso.` });
  } catch (err) {
    console.error('[Admin] excluirPalpite:', err);
    return res.status(500).json({ error: 'Erro ao excluir palpite.' });
  }
}

// ── PATCH /api/admin/palpites/:id/confirmar — Confirma pagamento ─
async function confirmarPalpiteManual(req, res) {
  const { id } = req.params;
  try {
    const p = await prisma.palpiteCampanha.findUnique({ where: { id: Number(id) } });
    if (!p) return res.status(404).json({ error: 'Palpite não encontrado.' });
    if (p.pagamentoConfirmado) return res.status(400).json({ error: 'Pagamento já confirmado.' });

    await prisma.palpiteCampanha.update({
      where: { id: Number(id) },
      data:  { pagamentoConfirmado: true },
    });
    return res.json({ mensagem: `Pagamento do palpite #${id} confirmado manualmente.` });
  } catch (err) {
    console.error('[Admin] confirmarPalpiteManual:', err);
    return res.status(500).json({ error: 'Erro ao confirmar pagamento.' });
  }
}

// ── POST /api/admin/palpites/:id/reenviar — Reenvia WhatsApp ────
async function reenviarPalpite(req, res) {
  const { id } = req.params;
  try {
    const p = await prisma.palpiteCampanha.findUnique({
      where:   { id: Number(id) },
      include: { usuario: { select: { telefone: true, nomeCompleto: true, codigoCdp: true } } },
    });
    if (!p) return res.status(404).json({ error: 'Palpite não encontrado.' });
    if (!p.pagamentoConfirmado) return res.status(400).json({ error: 'Pagamento ainda não confirmado.' });

    // Reutiliza o serviço de notificação existente
    const notif = require('../services/notificacao.service');
    // Busca o pagamento mais recente deste usuário para reenviar
    const pagamento = await prisma.pagamento.findFirst({
      where:   { usuarioId: p.usuarioId, status: 'APROVADO' },
      orderBy: { criadoEm: 'desc' },
    });
    if (pagamento) {
      await notif.notificarPalpiteConfirmado(pagamento.id);
    }
    return res.json({ mensagem: 'Confirmação reenviada via WhatsApp.' });
  } catch (err) {
    console.error('[Admin] reenviarPalpite:', err);
    return res.status(500).json({ error: 'Erro ao reenviar.' });
  }
}
