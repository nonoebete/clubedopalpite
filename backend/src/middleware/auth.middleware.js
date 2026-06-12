// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

// ── Verifica token JWT e injeta req.user ───────────────────────
function autenticar(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, codigoCdp, perfil }
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ── Restringe a perfil ADMIN ───────────────────────────────────
function apenasAdmin(req, res, next) {
  if (req.user?.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  next();
}

module.exports = { autenticar, apenasAdmin };
