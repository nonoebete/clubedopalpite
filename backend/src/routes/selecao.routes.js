// src/routes/selecao.routes.js
const router = require('express').Router();
const prisma = require('../models/prisma');

// Lista todas as seleções (público)
router.get('/', async (req, res) => {
  const selecoes = await prisma.selecao.findMany({ orderBy: { nome: 'asc' } });
  res.json(selecoes);
});

module.exports = router;
