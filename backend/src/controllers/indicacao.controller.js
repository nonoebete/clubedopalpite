// src/controllers/indicacao.controller.js
// Sistema de indicações com bônus de cadastro + % nos palpites
// Saldo usável via PIX ou para pagar palpites

const prisma  = require('../models/prisma');
const bcrypt  = require('bcryptjs');
const notif   = require('../services/notificacao.service');

// ── Utilitário: normaliza nome para senha (3 letras + 123) ─────
function normNome(nome) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().split(' ')[0].toLowerCase().slice(0, 3) + '123';
}

// ── Garante que existe ConfigIndicacao (seed automático) ────────
async function getConfig() {
  let cfg = await prisma.configIndicacao.findUnique({ where: { id: 1 } });
  if (!cfg) {
    cfg = await prisma.configIndicacao.create({
      data: { id: 1, bonusCadastro: 5.00, percentPalpite: 10.00, ativo: true }
    });
  }
  return cfg;
}

// ── Garante que existe ContaCorrente para o usuário ─────────────
async function getOuCriarConta(usuarioId) {
  let conta = await prisma.contaCorrente.findUnique({ where: { usuarioId } });
  if (!conta) {
    conta = await prisma.contaCorrente.create({
      data: { usuarioId, saldo: 0, totalGanho: 0 }
    });
  }
  return conta;
}

// ══════════════════════════════════════════════════════════════
//  1. CADASTRO COM CÓDIGO DE INDICAÇÃO
//  POST /api/indicacao/cadastrar?ref=CDP15
// ══════════════════════════════════════════════════════════════
async function cadastrarComIndicacao(req, res) {
  const { nomeCompleto, apelido, telefone } = req.body;
  const refCode = req.query.ref || req.body.ref;

  if (!nomeCompleto || !apelido || !telefone) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  const cfg = await getConfig();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Encontra o indicador pelo CDP
      let indicador = null;
      if (refCode && cfg.ativo) {
        indicador = await tx.usuario.findUnique({
          where: { codigoCdp: refCode.toUpperCase() }
        });
      }

      // Gera CDP sequencial
      const ultimo = await tx.usuario.findFirst({ orderBy: { id: 'desc' } });
      const novoId = (ultimo?.id ?? 0) + 1;
      const codigoCdp = `CDP${novoId}`;
      const senhaBase = normNome(nomeCompleto);
      const senhaHash = await bcrypt.hash(senhaBase, 10);

      // Cria o novo usuário
      const novoUsuario = await tx.usuario.create({
        data: { codigoCdp, nomeCompleto, apelido, telefone, senhaHash, perfil: 'PALPITEIRO' }
      });

      // Registra a indicação e credita bônus ao indicador
      if (indicador) {
        await tx.indicacao.create({
          data: { indicadorId: indicador.id, indicadoId: novoUsuario.id }
        });

        // Cria conta do indicador se não existir e credita bônus
        const contaIndicador = await getOuCriarConta(indicador.id);
        const bonus = Number(cfg.bonusCadastro);
        await tx.contaCorrente.update({
          where: { id: contaIndicador.id },
          data: {
            saldo:      { increment: bonus },
            totalGanho: { increment: bonus },
          }
        });
        await tx.movimentoConta.create({
          data: {
            contaId:     contaIndicador.id,
            tipo:        'BONUS_CADASTRO',
            valor:       bonus,
            descricao:   `Bônus por indicar ${apelido} (${codigoCdp})`,
            referenciaId: novoUsuario.id,
          }
        });

        // Notifica indicador via WhatsApp
        notif.notificarBonus?.(indicador, bonus, apelido).catch(() => {});
      }

      // Cria conta corrente zerada para o novo membro
      await tx.contaCorrente.create({ data: { usuarioId: novoUsuario.id } });

      return { novoUsuario, codigoCdp, senhaBase, indicador };
    });

    // Notifica novo membro via WhatsApp
    notif.notificarBoasVindas?.(result.novoUsuario, result.senhaBase).catch(() => {});

    return res.status(201).json({
      mensagem: 'Cadastro realizado com sucesso!',
      codigoCdp: result.codigoCdp,
      senhaAcesso: result.senhaBase,
      indicadoPor: result.indicador ? result.indicador.codigoCdp : null,
    });
  } catch (err) {
    console.error('[IND] Erro no cadastro:', err.message);
    return res.status(500).json({ error: 'Erro ao criar conta.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  2. CREDITAR COMISSÃO DE PALPITE (chamado no webhook PIX)
//  Chamada interna: creditarComissaoPalpite(usuarioId, valorPalpite)
// ══════════════════════════════════════════════════════════════
async function creditarComissaoPalpite(usuarioId, valorPalpite) {
  try {
    const cfg = await getConfig();
    if (!cfg.ativo) return;

    // Verifica se este usuário foi indicado por alguém
    const indicacao = await prisma.indicacao.findUnique({
      where: { indicadoId: usuarioId },
      include: { indicador: true }
    });
    if (!indicacao) return;

    const comissao = (Number(valorPalpite) * Number(cfg.percentPalpite)) / 100;
    if (comissao <= 0) return;

    const conta = await getOuCriarConta(indicacao.indicadorId);
    await prisma.$transaction([
      prisma.contaCorrente.update({
        where: { id: conta.id },
        data: { saldo: { increment: comissao }, totalGanho: { increment: comissao } }
      }),
      prisma.movimentoConta.create({
        data: {
          contaId:     conta.id,
          tipo:        'COMISSAO_PALPITE',
          valor:       comissao,
          descricao:   `${Number(cfg.percentPalpite)}% sobre palpite de ${indicacao.indicado?.apelido ?? '?'} (R$ ${Number(valorPalpite).toFixed(2)})`,
          referenciaId: usuarioId,
        }
      })
    ]);
    console.log(`[IND] Comissão R$${comissao.toFixed(2)} creditada para ${indicacao.indicador.codigoCdp}`);
  } catch (err) {
    console.error('[IND] Erro ao creditar comissão:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  3. MINHA CONTA CORRENTE
//  GET /api/indicacao/minha-conta
// ══════════════════════════════════════════════════════════════
async function minhaConta(req, res) {
  const usuarioId = req.user.id;
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    const conta   = await getOuCriarConta(usuarioId);

    const movimentos = await prisma.movimentoConta.findMany({
      where:   { contaId: conta.id },
      orderBy: { criadoEm: 'desc' },
      take:    50,
    });

    // Indicados por este usuário
    const indicados = await prisma.indicacao.findMany({
      where:   { indicadorId: usuarioId },
      include: { indicado: { select: { apelido: true, codigoCdp: true, criadoEm: true } } },
      orderBy: { criadoEm: 'desc' },
    });

    // Total de comissões geradas pelos indicados
    const totalComissoes = movimentos
      .filter(m => m.tipo === 'COMISSAO_PALPITE')
      .reduce((s, m) => s + Number(m.valor), 0);

    return res.json({
      conta: {
        saldo:      Number(conta.saldo).toFixed(2),
        totalGanho: Number(conta.totalGanho).toFixed(2),
      },
      linkIndicacao: `${process.env.APP_URL}/login.html?ref=${usuario.codigoCdp}`,
      codigoCdp: usuario.codigoCdp,
      indicados: indicados.map(i => ({
        apelido:   i.indicado.apelido,
        codigoCdp: i.indicado.codigoCdp,
        desde:     i.criadoEm,
      })),
      totalIndicados:  indicados.length,
      totalComissoes:  totalComissoes.toFixed(2),
      movimentos: movimentos.map(m => ({
        id:       m.id,
        tipo:     m.tipo,
        valor:    Number(m.valor).toFixed(2),
        descricao: m.descricao,
        criadoEm: m.criadoEm,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar conta.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  4. SOLICITAR RESGATE
//  POST /api/indicacao/resgatar
//  Body: { tipo: 'PIX'|'PALPITE', valor, pixChave? }
// ══════════════════════════════════════════════════════════════
async function solicitarResgate(req, res) {
  const usuarioId = req.user.id;
  const { tipo, valor, pixChave } = req.body;

  if (!tipo || !valor || Number(valor) <= 0) {
    return res.status(400).json({ error: 'Informe tipo e valor.' });
  }
  if (tipo === 'PIX' && !pixChave) {
    return res.status(400).json({ error: 'Informe a chave PIX.' });
  }

  const MINIMO_PIX     = 10.00;
  const MINIMO_PALPITE = 10.00;

  try {
    const conta = await getOuCriarConta(usuarioId);
    const saldo = Number(conta.saldo);
    const val   = Number(valor);

    if (val > saldo) {
      return res.status(400).json({ error: `Saldo insuficiente. Disponível: R$ ${saldo.toFixed(2)}` });
    }
    if (tipo === 'PIX'     && val < MINIMO_PIX)     return res.status(400).json({ error: `Valor mínimo para resgate PIX: R$ ${MINIMO_PIX.toFixed(2)}` });
    if (tipo === 'PALPITE' && val < MINIMO_PALPITE) return res.status(400).json({ error: `Valor mínimo para usar em palpites: R$ ${MINIMO_PALPITE.toFixed(2)}` });

    // Desconta saldo e cria solicitação
    await prisma.$transaction([
      prisma.contaCorrente.update({
        where: { id: conta.id },
        data:  { saldo: { decrement: val } }
      }),
      prisma.movimentoConta.create({
        data: {
          contaId:  conta.id,
          tipo:     tipo === 'PIX' ? 'RESGATE_PIX' : 'USO_PALPITE',
          valor:    val,
          descricao: tipo === 'PIX'
            ? `Resgate PIX solicitado — chave: ${pixChave}`
            : `Usado para pagar palpites`,
        }
      }),
      prisma.resgate.create({
        data: { usuarioId, tipo, valor: val, pixChave: pixChave || null }
      })
    ]);

    return res.json({
      mensagem: tipo === 'PIX'
        ? `Resgate de R$ ${val.toFixed(2)} solicitado! Será processado em até 2 dias úteis.`
        : `R$ ${val.toFixed(2)} reservado para seus próximos palpites!`,
      saldoRestante: (saldo - val).toFixed(2),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao processar resgate.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  5. ADMIN — VER TODOS OS INDICADORES
//  GET /api/admin/indicadores
// ══════════════════════════════════════════════════════════════
async function listarIndicadores(req, res) {
  try {
    const indicadores = await prisma.usuario.findMany({
      where:   { perfil: 'PALPITEIRO' },
      include: {
        contaCorrente: true,
        _count: { select: { indicacoesFeitas: true } }
      },
      orderBy: { id: 'asc' },
    });

    return res.json(indicadores.map(u => ({
      id:          u.id,
      codigoCdp:   u.codigoCdp,
      apelido:     u.apelido,
      telefone:    u.telefone,
      totalIndicados: u._count.indicacoesFeitas,
      saldo:       Number(u.contaCorrente?.saldo ?? 0).toFixed(2),
      totalGanho:  Number(u.contaCorrente?.totalGanho ?? 0).toFixed(2),
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar indicadores.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  6. ADMIN — VER RESGATES PENDENTES
//  GET /api/admin/resgates
// ══════════════════════════════════════════════════════════════
async function listarResgates(req, res) {
  const { status } = req.query;
  try {
    const resgates = await prisma.resgate.findMany({
      where:   status ? { status } : {},
      include: { usuario: { select: { codigoCdp: true, apelido: true, telefone: true } } },
      orderBy: { criadoEm: 'desc' },
    });
    return res.json(resgates);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar resgates.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  7. ADMIN — APROVAR / REJEITAR RESGATE
//  PATCH /api/admin/resgates/:id
//  Body: { status: 'PAGO'|'REJEITADO', obs? }
// ══════════════════════════════════════════════════════════════
async function atualizarResgate(req, res) {
  const { id } = req.params;
  const { status, obs } = req.body;
  if (!['PAGO', 'REJEITADO'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  try {
    const resgate = await prisma.resgate.findUnique({ where: { id: Number(id) } });
    if (!resgate) return res.status(404).json({ error: 'Resgate não encontrado.' });

    await prisma.$transaction(async (tx) => {
      await tx.resgate.update({ where: { id: Number(id) }, data: { status, obs } });

      // Se rejeitado, estorna o saldo
      if (status === 'REJEITADO') {
        const conta = await getOuCriarConta(resgate.usuarioId);
        await tx.contaCorrente.update({
          where: { id: conta.id },
          data:  { saldo: { increment: Number(resgate.valor) } }
        });
        await tx.movimentoConta.create({
          data: {
            contaId:  conta.id,
            tipo:     'ESTORNO',
            valor:    Number(resgate.valor),
            descricao: `Estorno de resgate rejeitado${obs ? ': ' + obs : ''}`,
          }
        });
      }
    });
    return res.json({ mensagem: `Resgate ${status.toLowerCase()} com sucesso.` });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar resgate.' });
  }
}

// ══════════════════════════════════════════════════════════════
//  8. ADMIN — CONFIGURAÇÃO DA COMISSÃO
//  GET /api/admin/config-indicacao
//  PUT /api/admin/config-indicacao
// ══════════════════════════════════════════════════════════════
async function getConfigIndicacao(req, res) {
  return res.json(await getConfig());
}
async function updateConfigIndicacao(req, res) {
  const { bonusCadastro, percentPalpite, ativo } = req.body;
  const cfg = await prisma.configIndicacao.upsert({
    where:  { id: 1 },
    update: { bonusCadastro, percentPalpite, ativo },
    create: { id: 1, bonusCadastro, percentPalpite, ativo: ativo ?? true },
  });
  return res.json({ mensagem: 'Configuração salva.', cfg });
}

module.exports = {
  cadastrarComIndicacao,
  creditarComissaoPalpite,
  minhaConta,
  solicitarResgate,
  listarIndicadores,
  listarResgates,
  atualizarResgate,
  getConfigIndicacao,
  updateConfigIndicacao,
};
