# 🏆 Clube de Palpites · Copa do Mundo 2026
### Sistema completo — versão final

---

## Estrutura do projeto

```
clube-palpite/
├── instalar.sh              ← Instalação completa com 1 comando
├── atualizar.sh             ← Redeploy sem perder dados
├── docker-compose.yml       ← Orquestra os 4 containers
├── .env.example             ← Modelo de variáveis
│
├── backend/                 ← API Node.js completa
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma    ← Banco de dados
│   │   └── seed.js          ← 48 seleções + admin + campanhas
│   └── src/
│       ├── server.js        ← Entry point (todos os módulos)
│       ├── controllers/     ← auth · palpite · admin · pagamento
│       │                       whatsapp · ranking · extrato · usuários
│       ├── routes/          ← Todas as rotas registradas
│       ├── services/        ← mercadopago · evolution · notificações
│       │                       jobs: expirar-pix · lembretes
│       ├── middleware/      ← JWT · role admin · bloqueio
│       └── models/          ← Prisma singleton
│
├── frontend/                ← 10 telas HTML
│   ├── Dockerfile
│   ├── nginx.conf
│   └── html/
│       ├── index.html          ← Landing page pública
│       ├── login.html          ← Cadastro + Login + pop-up
│       ├── portal.html         ← Portal do palpiteiro
│       ├── pix.html            ← Tela de pagamento PIX
│       ├── extrato.html        ← Extrato financeiro
│       ├── ranking.html        ← Ranking público ao vivo
│       ├── admin.html          ← Painel admin básico
│       ├── admin-avancado.html ← Admin com gráficos
│       ├── gestao-usuarios.html← Gestão de membros
│       └── style.css           ← CSS global
│
└── snapshot/                ← Backup automático
    ├── instalar.sh          ← Ativa cron de snapshots
    ├── snapshot.sh          ← Executa backup completo
    ├── restaurar.sh         ← Restaura um backup
    └── status-snapshot.sh  ← Painel de status
```

---

## Instalação na VPS (1 comando)

```bash
# 1. Envie para a VPS
scp -r clube-palpite/ root@IP_DA_VPS:/opt/clube-palpite/

# 2. Conecte e instale
ssh root@IP_DA_VPS
cd /opt/clube-palpite
sudo bash instalar.sh
```

O script faz tudo automaticamente:
- Instala Docker se necessário
- Configura `.env` interativamente (pede as credenciais)
- Build e sobe os 4 containers
- Instala snapshots com cron
- Cria a instância WhatsApp

---

## Containers

| Container | Imagem | Porta | Função |
|-----------|--------|-------|--------|
| `cdp_postgres` | postgres:16 | interno | Banco de dados |
| `cdp_backend` | Node.js 20 | interno | API REST |
| `cdp_frontend` | Nginx | 80 | Telas HTML |
| `cdp_evolution` | evolution-api | 8080 | WhatsApp |

---

## APIs disponíveis

### Públicas (sem auth)
| Rota | Descrição |
|------|-----------|
| `GET /health` | Status da API + módulos |
| `GET /api/ranking` | Ranking ao vivo |
| `GET /api/campanhas` | Campanhas ativas |
| `GET /api/selecoes` | 48 seleções |
| `POST /api/auth/cadastro` | Criar conta |
| `POST /api/auth/login` | Login |
| `POST /api/pagamentos/webhook` | Webhook Mercado Pago |

### Autenticadas (JWT)
| Rota | Descrição |
|------|-----------|
| `POST /api/pagamentos` | Iniciar PIX |
| `GET /api/pagamentos/:id/status` | Polling status PIX |
| `GET /api/palpites/meus` | Meus palpites |
| `GET /api/extrato/meu` | Extrato financeiro |
| `POST /api/auth/trocar-senha` | Trocar senha |

### Admin (JWT + perfil ADMIN)
| Rota | Descrição |
|------|-----------|
| `POST /api/admin/apurar` | Apurar resultado + rateio |
| `GET /api/admin/financeiro` | Relatório financeiro |
| `GET /api/admin/usuarios` | Listar membros |
| `PUT /api/admin/usuarios/:id` | Editar membro |
| `POST /api/admin/usuarios/:id/senha` | Resetar senha |
| `PATCH /api/admin/usuarios/:id/status` | Bloquear/desbloquear |
| `GET /api/whatsapp/status` | Status WhatsApp |
| `GET /api/whatsapp/qrcode` | QR Code para conectar |
| `POST /api/whatsapp/testar` | Mensagem de teste |

---

## Credenciais iniciais

| | Código | Senha |
|---|--------|-------|
| Admin | `ADMIN001` | `admin@Copa2026` |

⚠️ **Troque a senha do admin imediatamente após o primeiro acesso!**

---

## WhatsApp — conectar o número

```bash
# Via curl (na VPS)
curl http://localhost:8080/instance/connect/clube-palpite \
  -H "apikey: SUA_CHAVE_EVOLUTION"

# Ou via API admin (com JWT)
GET /api/whatsapp/qrcode
```

Escaneie o QR Code com o WhatsApp do número que vai enviar as mensagens.

---

## Notificações WhatsApp automáticas

| Evento | Quando |
|--------|--------|
| 🎉 Boas-vindas + CDP + senha | Cadastro |
| ✅ Palpite confirmado + seleções | PIX aprovado |
| 🔔 Fase abrindo | 1h antes do início |
| ⏰ Fase encerrando | 24h antes do fim |
| ⏳ PIX não pago | 25 min após gerar |
| 🏆 Resultado + prêmio | Após apuração |

---

## Snapshots automáticos

| Tipo | Horário | Retenção |
|------|---------|----------|
| Diário | 02:00 seg–sáb | 7 dias |
| Semanal | 02:00 domingo | 4 semanas |
| Mensal | 02:00 dia 1 | 3 meses |

```bash
cdp-snapshot              # snapshot manual
cdp-status                # painel de status
cdp-restaurar --listar    # ver snapshots
```

---

## Comandos úteis no servidor

```bash
# Ver logs em tempo real
docker compose -f /opt/clube-palpite/docker-compose.yml logs -f backend

# Reiniciar um serviço
docker compose -f /opt/clube-palpite/docker-compose.yml restart backend

# Atualizar após mudanças
cd /opt/clube-palpite && bash atualizar.sh

# Backup manual
cdp-snapshot

# Ver status dos containers
docker compose -f /opt/clube-palpite/docker-compose.yml ps
```
