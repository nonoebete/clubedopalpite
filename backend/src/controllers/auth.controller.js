// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const prisma = require('../models/prisma');

// ── Utilitário: gera base da senha (3 primeiras letras do nome) ─
function normalizarNome(nome) {
  return nome
    .trim()
    .split(' ')[0]                        // primeiro nome
    .normalize('NFD')                     // decompõe acentos
    .replace(/[\u0300-\u036f]/g, '')      // remove diacríticos
    .toLowerCase()
    .slice(0, 3);                         // apenas 3 primeiras letras
}

// ── Gera o código CDP: "CDP" + id sequencial ───────────────────
function gerarCodigoCdp(id) {
  return `CDP${id}`;
}

// ── POST /api/auth/cadastro ────────────────────────────────────
async function cadastrar(req, res) {
  const { nomeCompleto, apelido, telefone, cep, endereco, bairro, cidade, estado } = req.body;

  if (!nomeCompleto || !apelido || !telefone) {
    return res.status(400).json({ error: 'Preencha nome completo, apelido e telefone.' });
  }

  try {
    // Cria o usuário com id autoincrement para derivar o CDP
    // Primeiro inserimos com senha temporária, depois atualizamos
    const senhaBase   = normalizarNome(nomeCompleto) + '123';
    const senhaHash   = await bcrypt.hash(senhaBase, 10);
    const codigoCdpTmp = 'CDP0'; // será corrigido logo abaixo

    const novoUsuario = await prisma.usuario.create({
      data: {
        codigoCdp:    codigoCdpTmp,
        nomeCompleto: nomeCompleto.trim(),
        apelido:      apelido.trim(),
        telefone:     telefone.trim(),
        cep:          cep ? cep.trim() : null,
        endereco:     endereco ? endereco.trim() : null,
        bairro:       bairro ? bairro.trim() : null,
        cidade:       cidade ? cidade.trim() : null,
        estado:       estado ? estado.trim().toUpperCase() : null,
        senhaHash,
        perfil:       'PALPITEIRO',
        tipoUsuario:  'NORMAL',
      },
    });

    // Agora atualiza o código CDP com o id real
    const codigoCdp = gerarCodigoCdp(novoUsuario.id);
    const usuario = await prisma.usuario.update({
      where: { id: novoUsuario.id },
      data:  { codigoCdp },
    });

    return res.status(201).json({
      mensagem:   'Seja bem-vindo ao Clube de Palpites!',
      codigoCdp,
      senhaAcesso: senhaBase,
      aviso:      'Você pode trocar sua senha a qualquer momento em "Gestão da Conta".',
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
}

// ── POST /api/auth/login ───────────────────────────────────────
async function login(req, res) {
  const { codigoCdp, senha } = req.body;

  if (!codigoCdp || !senha) {
    return res.status(400).json({ error: 'Informe o código CDP e a senha.' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { codigoCdp } });

    if (!usuario) {
      return res.status(401).json({ error: 'Código CDP ou senha incorretos.' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Código CDP ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: usuario.id, codigoCdp: usuario.codigoCdp, perfil: usuario.perfil },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      token,
      usuario: {
        id:          usuario.id,
        codigoCdp:   usuario.codigoCdp,
        nomeCompleto: usuario.nomeCompleto,
        apelido:     usuario.apelido,
        telefone:    usuario.telefone,
        perfil:      usuario.perfil,
        criadoEm:    usuario.criadoEm,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao fazer login.' });
  }
}

// ── POST /api/auth/trocar-senha ────────────────────────────────
async function trocarSenha(req, res) {
  const { senhaAtual, novaSenha } = req.body;
  const usuarioId = req.user.id;

  if (!senhaAtual || !novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres.' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

    const ok = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
    await prisma.usuario.update({
      where: { id: usuarioId },
      data:  { senhaHash: novaSenhaHash },
    });

    return res.json({ mensagem: 'Senha alterada com sucesso.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao trocar senha.' });
  }
}

// ── GET /api/auth/minha-conta ──────────────────────────────────
async function minhaConta(req, res) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { id: true, codigoCdp: true, nomeCompleto: true, apelido: true, telefone: true, perfil: true, criadoEm: true },
    });
    return res.json(usuario);
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar conta.' });
  }
}

module.exports = { cadastrar, login, trocarSenha, minhaConta };
