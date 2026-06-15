// Script para criar campanha 3 e partidas direto no banco
// Rode: node seed-campanha3.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Criando campanha 3...');

  // Campanha 3
  await prisma.campanha.upsert({
    where:  { id: 3 },
    update: {},
    create: {
      id:           3,
      nome:         'Palpite por Resultado — Jogos da 1ª Fase · Copa 2026',
      fase:         1,
      inicio:       new Date('2026-06-16T00:00:00-03:00'),
      fim:          new Date('2026-06-18T23:59:59-03:00'),
      valorPalpite: 10.00,
      tipo:         'PALPITE_RESULTADO',
      percClube:    40.00,
      percPremio:   60.00,
      ativa:        true,
    },
  });
  console.log('✅ Campanha 3 criada!');

  // Busca IDs das seleções
  const siglas = ['BRA','MAR','ARG','ALG','ESP','URU','FRA','SEN','ENG','CRO','POR','COL','GER','ECU','NED','JPN'];
  const sel = {};
  for (const sigla of siglas) {
    const found = await prisma.selecao.findUnique({ where: { sigla } });
    if (found) {
      sel[sigla] = found.id;
      console.log(`  ✓ ${sigla} → id ${found.id}`);
    } else {
      console.log(`  ⚠️  ${sigla} NÃO ENCONTRADA no banco!`);
    }
  }

  // Partidas
  const PARTIDAS = [
    { casa:'BRA', fora:'MAR', grupo:'C', dataHora:'2026-06-16T16:00:00-03:00' },
    { casa:'ARG', fora:'ALG', grupo:'J', dataHora:'2026-06-16T19:00:00-03:00' },
    { casa:'ESP', fora:'URU', grupo:'H', dataHora:'2026-06-17T13:00:00-03:00' },
    { casa:'FRA', fora:'SEN', grupo:'I', dataHora:'2026-06-17T16:00:00-03:00' },
    { casa:'ENG', fora:'CRO', grupo:'L', dataHora:'2026-06-17T19:00:00-03:00' },
    { casa:'POR', fora:'COL', grupo:'K', dataHora:'2026-06-18T13:00:00-03:00' },
    { casa:'GER', fora:'ECU', grupo:'E', dataHora:'2026-06-18T16:00:00-03:00' },
    { casa:'NED', fora:'JPN', grupo:'F', dataHora:'2026-06-18T19:00:00-03:00' },
  ];

  let criadas = 0;
  for (const p of PARTIDAS) {
    if (!sel[p.casa] || !sel[p.fora]) {
      console.log(`  ⚠️  Pulando ${p.casa} x ${p.fora} — seleção não encontrada`);
      continue;
    }
    const existente = await prisma.partida.findFirst({
      where: { campanhaId: 3, selecaoCasaId: sel[p.casa], selecaoForaId: sel[p.fora] },
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
      criadas++;
      console.log(`  ✅ ${p.casa} x ${p.fora} criada`);
    } else {
      console.log(`  ↩️  ${p.casa} x ${p.fora} já existe`);
    }
  }

  // Config de indicação
  await prisma.configIndicacao.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:               1,
      percentPalpite:   10.00,
      palpitesPorMarco: 100,
      valorBonusMarco:  100.00,
      ativo:            true,
    },
  });
  console.log('✅ Config de indicação criada!');

  console.log(`\n🎉 Concluído! ${criadas} partidas criadas na campanha 3.`);
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
