// ═══════════════════════════════════════════════════════════════
//  src/controllers/ranking.controller.js
//  GET /api/palpites/ranking  (público, sem auth)
// ═══════════════════════════════════════════════════════════════
const prisma = require('../models/prisma');

async function ranking(req, res) {
  const { fase } = req.query; // ?fase=1 | 2 | (vazio = geral)

  try {
    // Agrupa palpites confirmados por usuário
    const where = { pagamentoConfirmado: true };
    if (fase) where.campanhaId = await getCampanhaIdPorFase(Number(fase));

    const dados = await prisma.palpiteCampanha.groupBy({
      by:      ['usuarioId'],
      where,
      _count:  { id: true },
      _sum:    { valorPago: true, premioRecebido: true },
      orderBy: { _count: { id: 'desc' } },
      take:    50,
    });

    const ids = dados.map(d => d.usuarioId);
    const usuarios = await prisma.usuario.findMany({
      where:  { id: { in: ids } },
      select: { id: true, apelido: true, codigoCdp: true },
    });
    const mapa = Object.fromEntries(usuarios.map(u => [u.id, u]));

    const resultado = dados.map((d, i) => ({
      posicao:   i + 1,
      apelido:   mapa[d.usuarioId]?.apelido   ?? '-',
      codigoCdp: mapa[d.usuarioId]?.codigoCdp ?? '-',
      palpites:  d._count.id,
      investido: Number(d._sum.valorPago    ?? 0).toFixed(2),
      premios:   Number(d._sum.premioRecebido ?? 0).toFixed(2),
    }));

    // Estatísticas gerais para o painel público
    const [totalMembros, totalPalpites, totalArrecadado] = await Promise.all([
      prisma.usuario.count({ where: { perfil: 'PALPITEIRO' } }),
      prisma.palpiteCampanha.count({ where: { pagamentoConfirmado: true } }),
      prisma.palpiteCampanha.aggregate({ where: { pagamentoConfirmado: true }, _sum: { valorPago: true } }),
    ]);

    return res.json({
      ranking: resultado,
      stats: {
        totalMembros,
        totalPalpites,
        totalArrecadado: Number(totalArrecadado._sum.valorPago ?? 0).toFixed(2),
        fundoPremios:    (Number(totalArrecadado._sum.valorPago ?? 0) * 0.6).toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar ranking.' });
  }
}

async function getCampanhaIdPorFase(fase) {
  const c = await prisma.campanha.findFirst({ where: { fase } });
  return c?.id;
}

// ═══════════════════════════════════════════════════════════════
//  src/controllers/extrato.controller.js
//  GET /api/extrato/meu  (auth JWT)
// ═══════════════════════════════════════════════════════════════
async function meuExtrato(req, res) {
  const usuarioId = req.user.id;
  try {
    const [pagamentos, palpites] = await Promise.all([
      // Histórico de PIX
      prisma.pagamento.findMany({
        where:   { usuarioId },
        include: { campanha: { select: { nome: true, fase: true } } },
        orderBy: { criadoEm: 'desc' },
      }),
      // Palpites individuais
      prisma.palpiteCampanha.findMany({
        where:   { usuarioId },
        include: {
          campanha:      { select: { nome: true, fase: true } },
          selecaoCampea: { select: { nome: true, bandeiraCss: true } },
          selecaoVice:   { select: { nome: true, bandeiraCss: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
    ]);

    // KPIs
    const totalInvestido = palpites
      .filter(p => p.pagamentoConfirmado)
      .reduce((s, p) => s + Number(p.valorPago), 0);
    const totalPremios = palpites
      .filter(p => p.acertou)
      .reduce((s, p) => s + Number(p.premioRecebido ?? 0), 0);
    const palpitesAtivos    = palpites.filter(p => p.pagamentoConfirmado).length;
    const pagamentosAprov   = pagamentos.filter(p => p.status === 'APROVADO').length;

    return res.json({
      kpis: {
        totalInvestido:  totalInvestido.toFixed(2),
        totalPremios:    totalPremios.toFixed(2),
        palpitesAtivos,
        pagamentosAprov,
      },
      pagamentos: pagamentos.map(p => ({
        id:       p.id,
        titulo:   `PIX · ${p.campanha.nome}`,
        valor:    Number(p.valor).toFixed(2),
        status:   p.status,
        criadoEm: p.criadoEm,
        pagoEm:   p.pagoEm,
      })),
      palpites: palpites.map(p => ({
        id:        p.id,
        selecao:   p.selecaoCampea.nome,
        bandeira:  p.selecaoCampea.bandeiraCss,
        vice:      p.selecaoVice ? `${p.selecaoVice.bandeiraCss} ${p.selecaoVice.nome}` : null,
        fase:      p.campanha.fase,
        valor:     Number(p.valorPago).toFixed(2),
        pago:      p.pagamentoConfirmado,
        acertou:   p.acertou,
        premio:    p.premioRecebido ? Number(p.premioRecebido).toFixed(2) : null,
        criadoEm:  p.criadoEm,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar extrato.' });
  }
}

// ═══════════════════════════════════════════════════════════════
//  src/controllers/usuarios.admin.controller.js
//  CRUD de usuários pelo admin
// ═══════════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');

async function listar(req, res) {
  const { busca, status, fase } = req.query;
  try {
    const where = { perfil: 'PALPITEIRO' };
    if (status === 'bloqueado') where.bloqueado = true;
    if (status === 'ativo')     where.bloqueado = false;
    if (busca) {
      where.OR = [
        { nomeCompleto: { contains: busca, mode: 'insensitive' } },
        { apelido:      { contains: busca, mode: 'insensitive' } },
        { codigoCdp:    { contains: busca, mode: 'insensitive' } },
        { telefone:     { contains: busca } },
      ];
    }

    const usuarios = await prisma.usuario.findMany({
      where,
      select: {
        id: true, codigoCdp: true, nomeCompleto: true, apelido: true,
        telefone: true, bloqueado: true, criadoEm: true,
        _count: { select: { palpites: true } },
      },
      orderBy: { id: 'asc' },
    });

    return res.json(usuarios);
  } catch {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
}

async function editar(req, res) {
  const { id } = req.params;
  const { nomeCompleto, apelido, telefone } = req.body;
  if (!nomeCompleto || !apelido || !telefone) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  try {
    const usuario = await prisma.usuario.update({
      where: { id: Number(id) },
      data:  { nomeCompleto, apelido, telefone },
    });
    return res.json({ mensagem: 'Dados atualizados.', codigoCdp: usuario.codigoCdp });
  } catch {
    return res.status(500).json({ error: 'Erro ao editar usuário.' });
  }
}

async function resetarSenha(req, res) {
  const { id } = req.params;
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(id) } });
    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const primeiroNome = usuario.nomeCompleto
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(' ')[0].toLowerCase()
      .slice(0, 3);                         // 3 primeiras letras
    const novaSenha     = primeiroNome + '123';
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: Number(id) },
      data:  { senhaHash: novaSenhaHash },
    });

    // Notifica via WhatsApp (importação dinâmica para não quebrar se módulo não instalado)
    try {
      const notif = require('../services/notificacao.service');
      if (notif?.notificarResetSenha) {
        await notif.notificarResetSenha(usuario, novaSenha);
      }
    } catch {}

    return res.json({ mensagem: `Senha de ${usuario.codigoCdp} resetada.`, novaSenha });
  } catch {
    return res.status(500).json({ error: 'Erro ao resetar senha.' });
  }
}

async function alterarStatus(req, res) {
  const { id } = req.params;
  const { bloqueado } = req.body; // true | false
  if (bloqueado === undefined) return res.status(400).json({ error: 'Informe "bloqueado" (true/false).' });
  try {
    const usuario = await prisma.usuario.update({
      where: { id: Number(id) },
      data:  { bloqueado: Boolean(bloqueado) },
    });
    const acao = bloqueado ? 'bloqueado' : 'desbloqueado';
    return res.json({ mensagem: `${usuario.codigoCdp} ${acao} com sucesso.` });
  } catch {
    return res.status(500).json({ error: 'Erro ao alterar status.' });
  }
}

// ── Rotas ────────────────────────────────────────────────────
// Adicione ao seu src/routes/ ou ao arquivo de rotas existente:

// ranking.routes.js (público)
// router.get('/', rankingCtrl.ranking);  → app.use('/api/palpites/ranking', ...)

// extrato.routes.js (auth)
// router.get('/meu', autenticar, extratoCtrl.meuExtrato);

// usuarios.admin.routes.js (admin)
// router.get('/',                   autenticar, apenasAdmin, usuariosCtrl.listar);
// router.put('/:id',                autenticar, apenasAdmin, usuariosCtrl.editar);
// router.post('/:id/resetar-senha', autenticar, apenasAdmin, usuariosCtrl.resetarSenha);
// router.patch('/:id/status',       autenticar, apenasAdmin, usuariosCtrl.alterarStatus);

module.exports = {
  // ranking
  ranking,
  // extrato
  meuExtrato,
  // gestão de usuários
  listar, editar, resetarSenha, alterarStatus,
};
