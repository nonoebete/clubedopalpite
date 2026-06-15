// prisma/seed.js — popula o banco com dados iniciais
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// 48 seleções oficiais · Copa do Mundo 2026 · Grupos A–L (4 seleções cada)
const SELECOES = [
  // GRUPO A
  { nome: 'México',           sigla: 'MEX', grupo: 'A', bandeiraCss: 'https://flagcdn.com/w40/mx.png' },
  { nome: 'África do Sul',    sigla: 'RSA', grupo: 'A', bandeiraCss: 'https://flagcdn.com/w40/za.png' },
  { nome: 'Coreia do Sul',    sigla: 'KOR', grupo: 'A', bandeiraCss: 'https://flagcdn.com/w40/kr.png' },
  { nome: 'República Tcheca', sigla: 'CZE', grupo: 'A', bandeiraCss: 'https://flagcdn.com/w40/cz.png' },
  // GRUPO B
  { nome: 'Canadá',           sigla: 'CAN', grupo: 'B', bandeiraCss: 'https://flagcdn.com/w40/ca.png' },
  { nome: 'Bósnia',           sigla: 'BIH', grupo: 'B', bandeiraCss: 'https://flagcdn.com/w40/ba.png' },
  { nome: 'Qatar',            sigla: 'QAT', grupo: 'B', bandeiraCss: 'https://flagcdn.com/w40/qa.png' },
  { nome: 'Suíça',            sigla: 'SUI', grupo: 'B', bandeiraCss: 'https://flagcdn.com/w40/ch.png' },
  // GRUPO C
  { nome: 'Brasil',           sigla: 'BRA', grupo: 'C', bandeiraCss: 'https://flagcdn.com/w40/br.png' },
  { nome: 'Marrocos',         sigla: 'MAR', grupo: 'C', bandeiraCss: 'https://flagcdn.com/w40/ma.png' },
  { nome: 'Haiti',            sigla: 'HAI', grupo: 'C', bandeiraCss: 'https://flagcdn.com/w40/ht.png' },
  { nome: 'Escócia',          sigla: 'SCO', grupo: 'C', bandeiraCss: 'https://flagcdn.com/w40/gb-sct.png' },
  // GRUPO D
  { nome: 'Estados Unidos',   sigla: 'USA', grupo: 'D', bandeiraCss: 'https://flagcdn.com/w40/us.png' },
  { nome: 'Paraguai',         sigla: 'PAR', grupo: 'D', bandeiraCss: 'https://flagcdn.com/w40/py.png' },
  { nome: 'Austrália',        sigla: 'AUS', grupo: 'D', bandeiraCss: 'https://flagcdn.com/w40/au.png' },
  { nome: 'Turquia',          sigla: 'TUR', grupo: 'D', bandeiraCss: 'https://flagcdn.com/w40/tr.png' },
  // GRUPO E
  { nome: 'Alemanha',         sigla: 'GER', grupo: 'E', bandeiraCss: 'https://flagcdn.com/w40/de.png' },
  { nome: 'Curaçao',          sigla: 'CUW', grupo: 'E', bandeiraCss: 'https://flagcdn.com/w40/cw.png' },
  { nome: 'Costa do Marfim',  sigla: 'CIV', grupo: 'E', bandeiraCss: 'https://flagcdn.com/w40/ci.png' },
  { nome: 'Equador',          sigla: 'ECU', grupo: 'E', bandeiraCss: 'https://flagcdn.com/w40/ec.png' },
  // GRUPO F
  { nome: 'Holanda',          sigla: 'NED', grupo: 'F', bandeiraCss: 'https://flagcdn.com/w40/nl.png' },
  { nome: 'Japão',            sigla: 'JPN', grupo: 'F', bandeiraCss: 'https://flagcdn.com/w40/jp.png' },
  { nome: 'Suécia',           sigla: 'SWE', grupo: 'F', bandeiraCss: 'https://flagcdn.com/w40/se.png' },
  { nome: 'Tunísia',          sigla: 'TUN', grupo: 'F', bandeiraCss: 'https://flagcdn.com/w40/tn.png' },
  // GRUPO G
  { nome: 'Bélgica',          sigla: 'BEL', grupo: 'G', bandeiraCss: 'https://flagcdn.com/w40/be.png' },
  { nome: 'Egito',            sigla: 'EGY', grupo: 'G', bandeiraCss: 'https://flagcdn.com/w40/eg.png' },
  { nome: 'Irã',              sigla: 'IRN', grupo: 'G', bandeiraCss: 'https://flagcdn.com/w40/ir.png' },
  { nome: 'Nova Zelândia',    sigla: 'NZL', grupo: 'G', bandeiraCss: 'https://flagcdn.com/w40/nz.png' },
  // GRUPO H
  { nome: 'Espanha',          sigla: 'ESP', grupo: 'H', bandeiraCss: 'https://flagcdn.com/w40/es.png' },
  { nome: 'Cabo Verde',       sigla: 'CPV', grupo: 'H', bandeiraCss: 'https://flagcdn.com/w40/cv.png' },
  { nome: 'Arábia Saudita',   sigla: 'KSA', grupo: 'H', bandeiraCss: 'https://flagcdn.com/w40/sa.png' },
  { nome: 'Uruguai',          sigla: 'URU', grupo: 'H', bandeiraCss: 'https://flagcdn.com/w40/uy.png' },
  // GRUPO I
  { nome: 'França',           sigla: 'FRA', grupo: 'I', bandeiraCss: 'https://flagcdn.com/w40/fr.png' },
  { nome: 'Senegal',          sigla: 'SEN', grupo: 'I', bandeiraCss: 'https://flagcdn.com/w40/sn.png' },
  { nome: 'Iraque',           sigla: 'IRQ', grupo: 'I', bandeiraCss: 'https://flagcdn.com/w40/iq.png' },
  { nome: 'Noruega',          sigla: 'NOR', grupo: 'I', bandeiraCss: 'https://flagcdn.com/w40/no.png' },
  // GRUPO J
  { nome: 'Argentina',        sigla: 'ARG', grupo: 'J', bandeiraCss: 'https://flagcdn.com/w40/ar.png' },
  { nome: 'Argélia',          sigla: 'ALG', grupo: 'J', bandeiraCss: 'https://flagcdn.com/w40/dz.png' },
  { nome: 'Áustria',          sigla: 'AUT', grupo: 'J', bandeiraCss: 'https://flagcdn.com/w40/at.png' },
  { nome: 'Jordânia',         sigla: 'JOR', grupo: 'J', bandeiraCss: 'https://flagcdn.com/w40/jo.png' },
  // GRUPO K
  { nome: 'Portugal',         sigla: 'POR', grupo: 'K', bandeiraCss: 'https://flagcdn.com/w40/pt.png' },
  { nome: 'RD Congo',         sigla: 'COD', grupo: 'K', bandeiraCss: 'https://flagcdn.com/w40/cd.png' },
  { nome: 'Uzbequistão',      sigla: 'UZB', grupo: 'K', bandeiraCss: 'https://flagcdn.com/w40/uz.png' },
  { nome: 'Colômbia',         sigla: 'COL', grupo: 'K', bandeiraCss: 'https://flagcdn.com/w40/co.png' },
  // GRUPO L
  { nome: 'Inglaterra',       sigla: 'ENG', grupo: 'L', bandeiraCss: 'https://flagcdn.com/w40/gb-eng.png' },
  { nome: 'Croácia',          sigla: 'CRO', grupo: 'L', bandeiraCss: 'https://flagcdn.com/w40/hr.png' },
  { nome: 'Gana',             sigla: 'GHA', grupo: 'L', bandeiraCss: 'https://flagcdn.com/w40/gh.png' },
  { nome: 'Panamá',           sigla: 'PAN', grupo: 'L', bandeiraCss: 'https://flagcdn.com/w40/pa.png' },
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

  // Configuração do programa de indicações
  // 10% de comissão por palpite + R$100 a cada 100 palpites pagos por um mesmo indicado
  await prisma.configIndicacao.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id: 1,
      percentPalpite:   10.00,
      palpitesPorMarco: 100,
      valorBonusMarco:  100.00,
      ativo: true,
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
      inicio:       new Date('2026-06-10T00:00:00-03:00'),
      fim:          new Date('2026-07-04T23:59:59-03:00'),
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
      inicio:       new Date('2026-06-10T00:00:00-03:00'),
      fim:          new Date('2026-07-10T23:59:59-03:00'),
      valorPalpite: 15.00,
      tipo:         'CAMPEA_VICE',
      percClube:    40.00,
      percPremio:   60.00,
      ativa:        true, // ambas as fases abrem juntas em 10/06
    },
  });

  // ── Campanha 3 — Palpite por Resultado (jogos da 1ª fase) ─────
  // Jogos e palpites começam em 16/06/2026
  // Regras: R$10 por BILHETE (não por partida) — palpiteiro escolhe quantos jogos quiser
  // num único bilhete de R$10,00 · 3 pontos por acerto · rateio 60% Top 3 (30%/20%/10%)
  await prisma.campanha.upsert({
    where:  { id: 3 },
    update: {},
    create: {
      id:           3,
      nome:         'Palpite por Resultado — Jogos da 1ª Fase · Copa 2026',
      fase:         1,
      inicio:       new Date('2026-06-16T00:00:00-03:00'),
      fim:          new Date('2026-06-18T23:59:59-03:00'), // cobre os jogos de exemplo (16-18/06)
      valorPalpite: 10.00, // valor do BILHETE (fixo, independe da qtd de jogos)
      tipo:         'PALPITE_RESULTADO',
      percClube:    40.00,
      percPremio:   60.00,
      ativa:        true,  // aberta desde 16/06
    },
  });

  // ── Partidas de exemplo (a realizar) — Campanha 3 ─────────────
  // Busca os IDs das seleções pelas siglas para montar os confrontos
  const sel = {};
  for (const s of SELECOES) {
    const found = await prisma.selecao.findUnique({ where: { sigla: s.sigla } });
    sel[s.sigla] = found.id;
  }

  const PARTIDAS_EXEMPLO = [
    { casa: 'BRA', fora: 'MAR', grupo: 'C', dataHora: '2026-06-16T16:00:00-03:00' },
    { casa: 'ARG', fora: 'ALG', grupo: 'J', dataHora: '2026-06-16T19:00:00-03:00' },
    { casa: 'ESP', fora: 'URU', grupo: 'H', dataHora: '2026-06-17T13:00:00-03:00' },
    { casa: 'FRA', fora: 'SEN', grupo: 'I', dataHora: '2026-06-17T16:00:00-03:00' },
    { casa: 'ENG', fora: 'CRO', grupo: 'L', dataHora: '2026-06-17T19:00:00-03:00' },
    { casa: 'POR', fora: 'COL', grupo: 'K', dataHora: '2026-06-18T13:00:00-03:00' },
    { casa: 'GER', fora: 'ECU', grupo: 'E', dataHora: '2026-06-18T16:00:00-03:00' },
    { casa: 'NED', fora: 'JPN', grupo: 'F', dataHora: '2026-06-18T19:00:00-03:00' },
  ];

  for (const p of PARTIDAS_EXEMPLO) {
    const existente = await prisma.partida.findFirst({
      where: {
        campanhaId:    3,
        selecaoCasaId: sel[p.casa],
        selecaoForaId: sel[p.fora],
      },
    });
    if (!existente) {
      await prisma.partida.create({
        data: {
          campanhaId:    3,
          selecaoCasaId: sel[p.casa],
          selecaoForaId: sel[p.fora],
          dataHora:      new Date(p.dataHora),
          grupo:         p.grupo,
        },
      });
    }
  }

  console.log('✅ Seed concluído! Admin: ADMIN001 / admin@Copa2026');
  console.log(`✅ ${SELECOES.length} seleções inseridas (48 oficiais · Grupos A–L).`);
  console.log('✅ 3 campanhas configuradas (1ª Fase, 2ª Fase, Palpite por Resultado).');
  console.log(`✅ ${PARTIDAS_EXEMPLO.length} partidas cadastradas na campanha de Palpite por Resultado.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
