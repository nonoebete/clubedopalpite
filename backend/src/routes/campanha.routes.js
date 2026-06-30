// src/routes/campanha.routes.js
const router = require('express').Router();
const prisma = require('../models/prisma');
const { autenticar, apenasAdmin } = require('../middleware/auth.middleware');

// Lista campanhas ativas (público)
router.get('/', async (req, res) => {
  const campanhas = await prisma.campanha.findMany({
    where:   { ativa: true },
    orderBy: { fase: 'asc' },
  });
  res.json(campanhas);
});

// Cria campanha (admin)
router.post('/', autenticar, apenasAdmin, async (req, res) => {
  const { nome, fase, inicio, fim, valorPalpite, tipo } = req.body;
  try {
    const campanha = await prisma.campanha.create({
      data: { nome, fase, inicio: new Date(inicio), fim: new Date(fim), valorPalpite, tipo },
    });
    res.status(201).json(campanha);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar campanha.' });
  }
});

// Lista TODAS campanhas (admin)
router.get('/admin/todas', autenticar, apenasAdmin, async (req, res) => {
  try {
    const campanhas = await prisma.campanha.findMany({
      orderBy: { fase: 'asc' },
      include: {
        _count: { select: { palpites: true, pagamentos: true } }
      }
    });
    res.json(campanhas);
  } catch(e) { res.status(500).json({ error: 'Erro ao listar campanhas.' }); }
});

// Editar campanha (admin)
router.put('/:id', autenticar, apenasAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, fase, inicio, fim, valorPalpite, tipo, percClube, percPremio, ativa } = req.body;
  try {
    const data = {};
    if (nome !== undefined) data.nome = nome;
    if (fase !== undefined) data.fase = Number(fase);
    if (inicio !== undefined) data.inicio = new Date(inicio);
    if (fim !== undefined) data.fim = new Date(fim);
    if (valorPalpite !== undefined) data.valorPalpite = valorPalpite;
    if (tipo !== undefined) data.tipo = tipo;
    if (percClube !== undefined) data.percClube = percClube;
    if (percPremio !== undefined) data.percPremio = percPremio;
    if (ativa !== undefined) data.ativa = ativa;
    const campanha = await prisma.campanha.update({ where: { id: Number(id) }, data });
    res.json(campanha);
  } catch(e) { res.status(500).json({ error: 'Erro ao editar campanha.' }); }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────

// src/routes/selecao.routes.js  (exportado separadamente)
// Neste arquivo também incluímos as seleções e o admin

