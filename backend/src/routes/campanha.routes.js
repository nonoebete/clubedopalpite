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

module.exports = router;

// ─────────────────────────────────────────────────────────────

// src/routes/selecao.routes.js  (exportado separadamente)
// Neste arquivo também incluímos as seleções e o admin

