const router = require('express').Router();
const prisma = require('../models/prisma');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

router.get('/', autenticar, apenasAdmin, async (req, res) => {
  try {
    const saldo = await prisma.$queryRaw`SELECT * FROM saldo_admin LIMIT 1`;
    const transferencias = await prisma.$queryRaw`
      SELECT t.*, u.apelido as usuario_apelido, u.codigo_cdp as usuario_cdp, a.apelido as admin_apelido
      FROM transferencias_admin t
      JOIN usuarios u ON u.id = t.usuario_id
      JOIN usuarios a ON a.id = t.admin_id
      ORDER BY t.criado_em DESC LIMIT 50`;
    res.json({ saldo: saldo[0], transferencias });
  } catch(e) { res.status(500).json({ error: 'Erro ao buscar saldo.' }); }
});

router.post('/depositar', autenticar, apenasAdmin, async (req, res) => {
  const { valor } = req.body;
  if (!valor || valor <= 0) return res.status(400).json({ error: 'Valor invalido.' });
  try {
    await prisma.$executeRaw`UPDATE saldo_admin SET saldo=saldo+${Number(valor)}, total_entrada=total_entrada+${Number(valor)}, atualizado_em=NOW()`;
    const saldo = await prisma.$queryRaw`SELECT * FROM saldo_admin LIMIT 1`;
    res.json({ ok: true, saldo: saldo[0] });
  } catch(e) { res.status(500).json({ error: 'Erro ao depositar.' }); }
});

router.post('/transferir', autenticar, apenasAdmin, async (req, res) => {
  const { usuarioId, valor, descricao } = req.body;
  if (!usuarioId || !valor || valor <= 0) return res.status(400).json({ error: 'Dados invalidos.' });
  try {
    const saldoAtual = await prisma.$queryRaw`SELECT saldo FROM saldo_admin LIMIT 1`;
    if (Number(saldoAtual[0].saldo) < Number(valor)) return res.status(400).json({ error: 'Saldo administrativo insuficiente.' });
    await prisma.$executeRaw`UPDATE saldo_admin SET saldo=saldo-${Number(valor)}, total_saida=total_saida+${Number(valor)}, atualizado_em=NOW()`;
    await prisma.$executeRaw`INSERT INTO conta_corrente (usuario_id, saldo, total_ganho, atualizado_em) VALUES (${Number(usuarioId)}, ${Number(valor)}, ${Number(valor)}, NOW()) ON CONFLICT (usuario_id) DO UPDATE SET saldo=conta_corrente.saldo+${Number(valor)}, total_ganho=conta_corrente.total_ganho+${Number(valor)}, atualizado_em=NOW()`;
    await prisma.$executeRaw`INSERT INTO transferencias_admin (admin_id, usuario_id, valor, descricao) VALUES (${req.user.id}, ${Number(usuarioId)}, ${Number(valor)}, ${descricao || 'Pagamento em dinheiro'})`;
    res.json({ ok: true, mensagem: 'R$ ' + Number(valor).toFixed(2) + ' transferido com sucesso!' });
  } catch(e) { console.error('[Transferir]', e); res.status(500).json({ error: 'Erro ao transferir.' }); }
});

module.exports = router;
