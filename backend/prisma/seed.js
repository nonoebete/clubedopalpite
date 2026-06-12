// prisma/seed.js — popula o banco com dados iniciais
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// 48 seleções oficiais · Copa do Mundo 2026 · Grupos A–L (4 seleções cada)
const SELECOES = [
  // GRUPO A
  { nome: 'México',           sigla: 'MEX', grupo: 'A', bandeiraCss: '🇲🇽' },
  { nome: 'África do Sul',    sigla: 'RSA', grupo: 'A', bandeiraCss: '🇿🇦' },
  { nome: 'Coreia do Sul',    sigla: 'KOR', grupo: 'A', bandeiraCss: '🇰🇷' },
  { nome: 'República Tcheca', sigla: 'CZE', grupo: 'A', bandeiraCss: '🇨🇿' },
  // GRUPO B
  { nome: 'Canadá',           sigla: 'CAN', grupo: 'B', bandeiraCss: '🇨🇦' },
  { nome: 'Bósnia',           sigla: 'BIH', grupo: 'B', bandeiraCss: '🇧🇦' },
  { nome: 'Qatar',            sigla: 'QAT', grupo: 'B', bandeiraCss: '🇶🇦' },
  { nome: 'Suíça',            sigla: 'SUI', grupo: 'B', bandeiraCss: '🇨🇭' },
  // GRUPO C
  { nome: 'Brasil',           sigla: 'BRA', grupo: 'C', bandeiraCss: '🇧🇷' },
  { nome: 'Marrocos',         sigla: 'MAR', grupo: 'C', bandeiraCss: '🇲🇦' },
  { nome: 'Haiti',            sigla: 'HAI', grupo: 'C', bandeiraCss: '🇭🇹' },
  { nome: 'Escócia',          sigla: 'SCO', grupo: 'C', bandeiraCss: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  // GRUPO D
  { nome: 'Estados Unidos',   sigla: 'USA', grupo: 'D', bandeiraCss: '🇺🇸' },
  { nome: 'Paraguai',         sigla: 'PAR', grupo: 'D', bandeiraCss: '🇵🇾' },
  { nome: 'Austrália',        sigla: 'AUS', grupo: 'D', bandeiraCss: '🇦🇺' },
  { nome: 'Turquia',          sigla: 'TUR', grupo: 'D', bandeiraCss: '🇹🇷' },
  // GRUPO E
  { nome: 'Alemanha',         sigla: 'GER', grupo: 'E', bandeiraCss: '🇩🇪' },
  { nome: 'Curaçao',          sigla: 'CUW', grupo: 'E', bandeiraCss: '🇨🇼' },
  { nome: 'Costa do Marfim',  sigla: 'CIV', grupo: 'E', bandeiraCss: '🇨🇮' },
  { nome: 'Equador',          sigla: 'ECU', grupo: 'E', bandeiraCss: '🇪🇨' },
  // GRUPO F
  { nome: 'Holanda',          sigla: 'NED', grupo: 'F', bandeiraCss: '🇳🇱' },
  { nome: 'Japão',            sigla: 'JPN', grupo: 'F', bandeiraCss: '🇯🇵' },
  { nome: 'Suécia',           sigla: 'SWE', grupo: 'F', bandeiraCss: '🇸🇪' },
  { nome: 'Tunísia',          sigla: 'TUN', grupo: 'F', bandeiraCss: '🇹🇳' },
  // GRUPO G
  { nome: 'Bélgica',          sigla: 'BEL', grupo: 'G', bandeiraCss: '🇧🇪' },
  { nome: 'Egito',            sigla: 'EGY', grupo: 'G', bandeiraCss: '🇪🇬' },
  { nome: 'Irã',              sigla: 'IRN', grupo: 'G', bandeiraCss: '🇮🇷' },
  { nome: 'Nova Zelândia',    sigla: 'NZL', grupo: 'G', bandeiraCss: '🇳🇿' },
  // GRUPO H
  { nome: 'Espanha',          sigla: 'ESP', grupo: 'H', bandeiraCss: '🇪🇸' },
  { nome: 'Cabo Verde',       sigla: 'CPV', grupo: 'H', bandeiraCss: '🇨🇻' },
  { nome: 'Arábia Saudita',   sigla: 'KSA', grupo: 'H', bandeiraCss: '🇸🇦' },
  { nome: 'Uruguai',          sigla: 'URU', grupo: 'H', bandeiraCss: '🇺🇾' },
  // GRUPO I
  { nome: 'França',           sigla: 'FRA', grupo: 'I', bandeiraCss: '🇫🇷' },
  { nome: 'Senegal',          sigla: 'SEN', grupo: 'I', bandeiraCss: '🇸🇳' },
  { nome: 'Iraque',           sigla: 'IRQ', grupo: 'I', bandeiraCss: '🇮🇶' },
  { nome: 'Noruega',          sigla: 'NOR', grupo: 'I', bandeiraCss: '🇳🇴' },
  // GRUPO J
  { nome: 'Argentina',        sigla: 'ARG', grupo: 'J', bandeiraCss: '🇦🇷' },
  { nome: 'Argélia',          sigla: 'ALG', grupo: 'J', bandeiraCss: '🇩🇿' },
  { nome: 'Áustria',          sigla: 'AUT', grupo: 'J', bandeiraCss: '🇦🇹' },
  { nome: 'Jordânia',         sigla: 'JOR', grupo: 'J', bandeiraCss: '🇯🇴' },
  // GRUPO K
  { nome: 'Portugal',         sigla: 'POR', grupo: 'K', bandeiraCss: '🇵🇹' },
  { nome: 'RD Congo',         sigla: 'COD', grupo: 'K', bandeiraCss: '🇨🇩' },
  { nome: 'Uzbequistão',      sigla: 'UZB', grupo: 'K', bandeiraCss: '🇺🇿' },
  { nome: 'Colômbia',         sigla: 'COL', grupo: 'K', bandeiraCss: '🇨🇴' },
  // GRUPO L
  { nome: 'Inglaterra',       sigla: 'ENG', grupo: 'L', bandeiraCss: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { nome: 'Croácia',          sigla: 'CRO', grupo: 'L', bandeiraCss: '🇭🇷' },
  { nome: 'Gana',             sigla: 'GHA', grupo: 'L', bandeiraCss: '🇬🇭' },
  { nome: 'Panamá',           sigla: 'PAN', grupo: 'L', bandeiraCss: '🇵🇦' },
];

async function main() {
  console.log('🌱 Iniciando seed...');

  // Usuário admin
  const adminHash = await bcrypt.hash('admin@Copa2026', 10);
  await prisma.usuario.upsert({
    where:  { codigoCdp: 'ADMIN001' },
    update: {},
    create: {
      codigoCdp:    'ADMIN001',
      nomeCompleto: 'Administrador',
      apelido:      'Admin',
      telefone:     '00000000000',
      senhaHash:    adminHash,
      perfil:       'ADMIN',
    },
  });

  // 32 seleções
  for (const s of SELECOES) {
    await prisma.selecao.upsert({
      where:  { sigla: s.sigla },
      update: {},
      create: s,
    });
  }

  // Campanhas
  await prisma.campanha.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:           1,
      nome:         '1ª Fase — Seleção Campeã · Copa 2026',
      fase:         1,
      inicio:       new Date('2026-06-06T00:00:00-03:00'),
      fim:          new Date('2026-06-30T23:59:59-03:00'),
      valorPalpite: 10.00,
      tipo:         'CAMPEA',
      percClube:    40.00,
      percPremio:   60.00,
      ativa:        true,
    },
  });

  await prisma.campanha.upsert({
    where:  { id: 2 },
    update: {},
    create: {
      id:           2,
      nome:         '2ª Fase — Campeã + Vice-Campeã · Copa 2026',
      fase:         2,
      inicio:       new Date('2026-07-01T00:00:00-03:00'),
      fim:          new Date('2026-07-19T23:59:59-03:00'),
      valorPalpite: 15.00,
      tipo:         'CAMPEA_VICE',
      percClube:    40.00,
      percPremio:   60.00,
      ativa:        false, // abre em 01/07
    },
  });

  console.log('✅ Seed concluído! Admin: ADMIN001 / admin@Copa2026');
  console.log(`✅ ${SELECOES.length} seleções inseridas (48 oficiais · Grupos A–L).`);
  console.log('✅ 2 campanhas configuradas.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
