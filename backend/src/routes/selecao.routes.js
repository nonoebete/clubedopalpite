// src/routes/selecao.routes.js
const router = require('express').Router();
const prisma = require('../models/prisma');

// Lista todas as seleções (público)
router.get('/', async (req, res) => {
  const selecoes = await prisma.selecao.findMany({ orderBy: [{ ativa: 'desc' }, { nome: 'asc' }] });
  res.json(selecoes);
});

// PATCH /api/selecoes/:id/ativa — ativa ou desativa uma seleção (admin)
router.patch('/:id/ativa', async (req, res) => {
  const { id } = req.params;
  const { ativa } = req.body;
  if (typeof ativa !== 'boolean') return res.status(400).json({ error: 'Informe ativa: true ou false.' });
  try {
    const sel = await prisma.selecao.update({ where: { id: Number(id) }, data: { ativa } });
    return res.json({ ok: true, id: sel.id, nome: sel.nome, ativa: sel.ativa });
  } catch(e) {
    return res.status(500).json({ error: 'Erro ao atualizar seleção.' });
  }
});

// PATCH /api/selecoes/lote — ativa/desativa várias seleções de uma vez (admin)
router.patch('/lote', async (req, res) => {
  const { ids, ativa } = req.body;
  if (!Array.isArray(ids) || typeof ativa !== 'boolean') return res.status(400).json({ error: 'Informe ids[] e ativa.' });
  try {
    await prisma.selecao.updateMany({ where: { id: { in: ids.map(Number) } }, data: { ativa } });
    return res.json({ ok: true, atualizadas: ids.length, ativa });
  } catch(e) {
    return res.status(500).json({ error: 'Erro ao atualizar seleções.' });
  }
});

// PATCH /api/selecoes/:id/ativa — ativa ou desativa uma seleção (admin)
router.patch('/:id/ativa', async (req, res) => {
  const { id } = req.params;
  const { ativa } = req.body;
  if (typeof ativa !== 'boolean') return res.status(400).json({ error: 'Informe ativa: true ou false.' });
  try {
    const sel = await prisma.selecao.update({ where: { id: Number(id) }, data: { ativa } });
    return res.json({ ok: true, id: sel.id, nome: sel.nome, ativa: sel.ativa });
  } catch(e) {
    return res.status(500).json({ error: 'Erro ao atualizar seleção.' });
  }
});

// PATCH /api/selecoes/lote — ativa/desativa várias seleções de uma vez (admin)
router.patch('/lote', async (req, res) => {
  const { ids, ativa } = req.body;
  if (!Array.isArray(ids) || typeof ativa !== 'boolean') return res.status(400).json({ error: 'Informe ids[] e ativa.' });
  try {
    await prisma.selecao.updateMany({ where: { id: { in: ids.map(Number) } }, data: { ativa } });
    return res.json({ ok: true, atualizadas: ids.length, ativa });
  } catch(e) {
    return res.status(500).json({ error: 'Erro ao atualizar seleções.' });
  }
});

module.exports = router;
