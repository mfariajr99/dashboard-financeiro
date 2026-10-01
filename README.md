# Dashboard Financeiro

Sistema web (mobile-first, PWA) com uma visão **simples e clara** de quatro perguntas:

1. **O que temos para faturar no mês**: o que já foi pago, o que está em aberto e o que ainda vai vencer.
2. **Funil quente × venda efetivada × meta**: quanto falta e quantos dias úteis restam.
3. **Faturamento previsto × despesas**: lucro ou prejuízo, em R$ e em %.
4. **Meta × venda no ano** (jan–dez, qualquer ano): mês a mês, % de crescimento e total acumulado.

Stack: React + TypeScript (front), Node + TypeScript (API) e PostgreSQL. O login usa cookie HttpOnly e a senha fica guardada só como hash bcrypt.

> Design "Deep Blue Night" (anexo Lovable): fundo `#070D1E`, cards `#111C38`, acentos `#2563EB`/`#38BDF8`, **Montserrat** e ícones Lucide. A logo club'n aparece no canto superior esquerdo, com o arquivo original sem alterações (`web/src/assets/logo-clubn.png`).

---

## 1. Telas

| Tela | O que faz |
|---|---|
| **Dashboard** | Quatro blocos, nada além disso. **Faturamento do mês**: recebido, em aberto (vencido) e a vencer. **Vendas**: barra com vendido, funil quente e marcador da meta, mais quanto falta, dias úteis restantes e quanto vender por dia útil. **Resultado**: faturamento previsto − despesas = lucro/prejuízo e margem %. **Comparativo anual** Meta × Venda (Mês a mês / Acumulado), com tabela de % da meta, crescimento m/m e totais. |
| **Funil quente** | Cadastro de oportunidades do mês com três ações: **Venda efetuada**, **Próximo mês** (passa para o funil do mês seguinte e conta "Adiada Nx") e **Declinou** (pode ser reaberta). Cada cartão tem botão de consulta/edição e de exclusão. |
| **Faturamento** | Duas abas. **Receitas programadas** são as parcelas a receber por data, com tipo Cartão/Boleto/Pix e situação Recebido/Em aberto/A vencer; dá para marcar como recebida ou desfazer. **Vendas efetuadas** traz cada venda com suas parcelas. Também permite cadastrar **receita avulsa**. |
| **Despesas** | Cadastro e edição com vencimento, categoria e fornecedor, marcar como paga, repetir por N meses (série) e excluir só esta ou a série inteira. |
| **Metas** | Grade jan–dez com **meta de vendas** e **meta de faturamento** por mês e um botão "copiar para os meses seguintes". |
| **Calendário** | Visões mês e lista com receitas, despesas, vendas e oportunidades previstas, mais feriados nacionais. Tocar no dia abre o resumo, e cada item abre o cadastro para edição. |
| **Configurações** | Taxa do cartão (padrão 19%) e troca de senha. |

O botão **+** (canto inferior no celular, topo no desktop) cria oportunidade, venda, receita ou despesa de qualquer tela.

## 2. Fluxo principal: do funil ao faturamento

```
Oportunidade (funil do mês) ──► Venda efetuada ──► Parcelas no Faturamento
          │                          │
          ├─ Próximo mês ─► funil do mês seguinte (adiada +1)
          └─ Declinou ─► fora do funil (pode reabrir)
```

Ao clicar em **Venda efetuada**, o sistema pergunta como será pago:

| Forma | Desconto | Programação |
|---|---|---|
| **Pix / Boleto** | nenhum (líquido = bruto) | x parcelas com datas mensais a partir da 1ª data (cada data pode ser editada) |
| **Cartão** | **19%** (configurável) | informe a **data de disponibilidade do recurso**. Com parcelas, a taxa é calculada sobre o total e distribuída entre elas |

- O **valor bruto** entra em *Vendas efetuadas do mês* e conta para a **meta de vendas**.
- O **valor líquido** (bruto − 19% no cartão) entra no **Faturamento** na data de recebimento.
- Exemplo: R$ 10.000 no cartão gera **R$ 10.000 na meta de vendas**, taxa de R$ 1.900 e **R$ 8.100 no faturamento** na data informada.
- A venda também pode ser lançada direto em Faturamento → Nova venda, sem passar pelo funil.

## 3. Fórmulas

Todos os cálculos ficam em `server/src/core/calc.ts`, em **centavos inteiros**.

```
Taxa do cartão     = arredondar(bruto × 19%)                 líquido = bruto − taxa
Parcelas           = total ÷ n (sobra de centavos na última)  datas mensais (dia ajustado em meses curtos)

FATURAMENTO DO MÊS (parcelas líquidas com vencimento no mês)
  Recebido         = parcelas marcadas como recebidas
  Em aberto        = não recebidas com vencimento < hoje
  A vencer         = não recebidas com vencimento ≥ hoje
  Total previsto   = recebido + em aberto + a vencer

VENDAS DO MÊS
  Vendido          = Σ bruto das vendas com data no mês
  Funil quente     = Σ bruto das oportunidades em aberto do mês
  Falta            = max(0, meta de vendas − vendido)
  % da meta        = vendido ÷ meta  (arredonda para baixo: só mostra 100% quando bate)
  Dias úteis rest. = seg–sex de hoje (inclusive) até o fim do mês, sem feriados nacionais
  Vender por dia   = falta ÷ dias úteis restantes
  Meta de faturam. = comparada ao total previsto (programado) e ao recebido

RESULTADO DO MÊS
  Lucro/Prejuízo   = faturamento previsto do mês − despesas com vencimento no mês
  Margem %         = lucro ÷ faturamento previsto

COMPARATIVO ANUAL (jan–dez)
  % da meta        = vendido do mês ÷ meta do mês
  Crescimento m/m  = (vendido do mês ÷ vendido do mês anterior) − 1   (meses futuros: —)
  Acumulado        = soma de jan até o mês (meta e venda)
```

**Feriados nacionais considerados:** 1/1, Sexta-feira Santa (calculada pela Páscoa), 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12. Carnaval e Corpus Christi são pontos facultativos e não entram.

## 4. Regras e premissas

1. **Próximo mês** move a oportunidade para o funil do mês seguinte, adia a previsão em 1 mês e soma 1 em "Adiada".
2. **Excluir uma venda** devolve a oportunidade ao funil (status *Em aberto*). Isso é bloqueado se alguma parcela já tiver sido recebida.
3. **Editar uma venda** recria as parcelas quando valor, forma, número de parcelas ou datas mudam. Também é bloqueado se já houver parcela recebida, e mantém a taxa do cartão gravada na venda.
4. A parcela de uma venda só permite alterar a **data** e a **observação**. O valor muda pela venda.
5. Mudar a taxa do cartão nas Configurações só afeta vendas novas.
6. Um lançamento igual feito há menos de 2 minutos gera o aviso "possível duplicidade", com opção de salvar mesmo assim.
7. Fuso padrão: America/Sao_Paulo.

## 5. Arquitetura

```
dashboard-financeiro/            (monorepo npm workspaces)
├── server/
│   ├── src/core/                ⟵ REGRAS DE NEGÓCIO PURAS (compartilhadas com o ambiente de teste)
│   │   ├── money.ts, dates.ts   centavos, parcelas, dias úteis, feriados
│   │   ├── calc.ts              dashboard do mês, comparativo anual, calendário
│   │   ├── services.ts          funil, vendas, receitas, despesas, metas, configurações (validação Zod)
│   │   ├── routes.ts            tabela única de rotas /api
│   │   ├── repo.ts              interface de persistência
│   │   └── memoryRepo.ts, seed.ts
│   ├── src/db/                  schema Drizzle, DrizzleRepo (PostgreSQL), migrate, seed
│   ├── src/routes/              auth + adaptador Express da tabela de rotas
│   ├── src/middleware/          sessão, troca de senha obrigatória, CSRF (Origin)
│   ├── drizzle/                 migrations SQL versionadas
│   └── test/                    unit (regras) + integration (API real em Postgres)
├── web/                         React 18 + Vite + Tailwind + TanStack Query + Recharts (PWA)
│   └── src/features/            dashboard, funnel, billing, expenses, goals, calendar, settings, auth
│   └── src/demo/                backend simulado do ambiente de teste (HTML único)
├── render.yaml                  Blueprint do Render (web + Postgres)
└── .github/workflows/ci.yml     lint + typecheck + testes + build
```

Em produção, um único Web Service atende `/api/*` e entrega o front na **mesma origem**. Não é preciso CORS e o cookie `HttpOnly; Secure; SameSite=Lax` funciona direto.

**Por que Drizzle e não Prisma:** o Prisma depende de binários baixados de `binaries.prisma.sh`, que estava bloqueado no ambiente de validação. O Drizzle é JavaScript puro, gera migrations em SQL versionado e devolve `NUMERIC` como string, que o sistema converte para centavos sem usar float.

### Banco de dados
| Tabela | Papel |
|---|---|
| `users` | usuário, `password_hash` (bcrypt), `must_change_password`, `token_version` |
| `app_settings` | `cardFeeRate` (0,19), `timezone`, `companyName` |
| `opportunities` | funil: cliente, valor bruto, mês, previsão, responsável, status (ABERTA/VENDA_EFETUADA/DECLINOU), adiamentos, `sale_id` |
| `sales` | venda: bruto, forma, parcelas, taxa %, taxa R$, líquido, data, mês, `opportunity_id` (único) |
| `receivables` | parcelas/receitas: forma, nº/total, bruto, taxa, líquido, vencimento, status, data de recebimento (`sale_id` opcional = receita avulsa) |
| `expenses` | despesa: nome, categoria, fornecedor, valor, vencimento, status, pagamento, série |
| `goals` | `month` (YYYY-MM) único, meta de vendas, meta de faturamento |
| `audit_logs` | trilha de auditoria sem dados sensíveis |

## 6. Ambiente de teste (HTML único, sem servidor)

```bash
npm run build:demo -w web      # gera web/dist-demo/dashboard-financeiro-teste.html
```
Abra o arquivo no navegador do computador ou do celular. Não é preciso instalar nada.
- **Usa o mesmo código da produção**: as telas, a tabela de rotas e as regras de `server/src/core` são as mesmas. Só a persistência muda, com os dados guardados no localStorage daquele navegador.
- Login **mlf / 0080**, com troca de senha obrigatória no primeiro acesso.
- O botão **Modo teste** (canto inferior esquerdo) restaura a demonstração, zera os dados ou volta à senha inicial.
- **Roteiro sugerido**:
  1. No Funil quente, clique em *Venda* numa oportunidade, escolha Cartão em 2x e confira a taxa de 19% e as datas.
  2. Veja as parcelas em Faturamento e marque uma como recebida.
  3. Use *Próx. mês* em outra oportunidade e confira que ela vai para o mês seguinte.
  4. Cadastre uma despesa repetida por 3 meses.
  5. Ajuste as metas.
  6. Volte ao Dashboard e confira tudo atualizado.

## 7. Executar localmente

Pré-requisitos: **Node 22+** e **PostgreSQL 14+**.
```bash
npm install
createdb finplan && createdb finplan_test
cp .env.example server/.env          # ajuste DATABASE_URL e JWT_SECRET
npm run db:migrate
npm run db:seed                      # usuário inicial + configurações + dados de demonstração
npm run dev                          # API :3000 e front :5173
```
| Comando | O que faz |
|---|---|
| `npm run build` | compila API (`server/dist`) e front (`web/dist`) |
| `npm run start:prod` | migrations + seed base + servidor (API e front em :3000) |
| `npm test` | testes do servidor (unit + integração em `finplan_test`) e do front |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript nos dois pacotes |
| `npm run db:seed:demo:reset -w server` | apaga os lançamentos e recria a demo (mantém usuários) |
| `npm run db:generate` | gera nova migration após alterar `server/src/db/schema.ts` |

## 8. GitHub e Render

> **Atualizando a partir da versão anterior (FinPlan)?** No primeiro start, o sistema detecta as tabelas antigas e as **move** para o schema `legacy_v1` (backup: nada é apagado). Depois cria a estrutura nova e mantém o usuário e a senha atuais. Não é preciso mexer no banco.

```bash
git remote add origin https://github.com/<usuario>/dashboard-financeiro.git
git push -u origin main
```
O `.gitignore` exclui `node_modules`, `dist` e todos os `.env`. O CI roda lint, typecheck, testes (Postgres 16) e build.

**Render (Blueprint):**
1. **New → Blueprint** e conecte o repositório. O `render.yaml` cria o PostgreSQL e o Web Service, com build `npm ci --include=dev && npm run build`, start `npm run start:prod` e health check `/api/health`.
2. Quando o Render pedir, informe `INITIAL_ADMIN_PASSWORD` = `0080`. O `JWT_SECRET` é gerado automaticamente.
3. Clique em **Apply**, acesse a URL, entre com `mlf`/`0080` e troque a senha.
4. *(Opcional)* `SEED_DEMO=true` cria a demonstração se o banco estiver vazio. Volte para `false` antes de lançar dados reais.

Para configurar manualmente: crie o PostgreSQL e um Web Service Node com os mesmos comandos e as variáveis `NODE_ENV=production`, `DATABASE_URL` (Internal URL), `JWT_SECRET`, `INITIAL_ADMIN_USERNAME=mlf`, `INITIAL_ADMIN_PASSWORD=0080`, `APP_TIMEZONE=America/Sao_Paulo` e `NODE_VERSION=22`. Lembre que o plano free do Render hiberna e o Postgres free expira; para uso real, use planos pagos com backup.

### Variáveis de ambiente
| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `NODE_ENV` | sim (prod) | `development` | `production` ativa cookie Secure e CSP |
| `DATABASE_URL` | **sim** | — | conexão PostgreSQL |
| `DATABASE_SSL` | não | `auto` | `auto` \| `require` \| `disable` |
| `JWT_SECRET` | **sim** | — | ≥ 32 caracteres |
| `JWT_EXPIRES_IN_HOURS` | não | `12` | duração da sessão |
| `APP_TIMEZONE` | não | `America/Sao_Paulo` | fuso do "hoje" |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | 1º deploy | `mlf` / — | usuário inicial (só se não houver usuários; gravado como hash) |
| `SEED_DEMO` | não | `false` | cria dados de demonstração |
| `CORS_ORIGINS`, `LOG_LEVEL`, `PORT` | não | — | ajustes opcionais |

## 9. Segurança
- A senha inicial vem de variável de ambiente, **nunca do frontend**, e só o hash bcrypt (12 rounds) é gravado.
- Enquanto a senha não é trocada, todas as rotas respondem `PASSWORD_CHANGE_REQUIRED`. A nova senha precisa de 8 ou mais caracteres, com letras e números.
- Trocar a senha invalida todas as sessões anteriores (`token_version`).
- Outras proteções:
  - cookie `HttpOnly` + `SameSite=Lax` + `Secure`;
  - rate-limit no login;
  - checagem de `Origin` (CSRF);
  - helmet com CSP estrita e fontes locais;
  - validação Zod em todas as entradas;
  - logs com redação de senha/cookie;
  - o service worker não guarda respostas da API.

## 10. Testes
- **Servidor: 36 testes**.
  - Unitários: 19% no cartão (10.000 → 1.900/8.100), Pix/Boleto parcelado sem desconto, sobra de centavos, feriados e dias úteis, Próximo mês, conversão sem duplicar, dashboard (faturamento recebido/aberto/a vencer, lucro e prejuízo), bloqueio de edição com parcela recebida, comparativo anual e validação.
  - Integração: API real em Postgres, cobrindo login com troca obrigatória, CSRF, funil → venda → faturamento, despesas em série, metas e dashboard.
- **Front: 4 testes**: formatação e o backend simulado (login, conversão no cartão para o faturamento).
- **E2E no navegador** (Chromium, desktop e 390 px), sem erros de console e sem rolagem horizontal. Passos cobertos: login → troca de senha → venda no cartão pelo funil → próximo mês → receber parcela → despesa em série → metas → calendário → dashboard atualizado → persistência após recarregar.

## 11. API (base `/api`, exige sessão exceto `/health` e `/auth/*`)
Entidades trazem valores em reais (string decimal) e as visões (`dashboard`, `annual`, `calendar`) trazem valores em **centavos**.

| Rota | Descrição |
|---|---|
| `GET/POST /opportunities`, `GET/PUT/DELETE /opportunities/:id` | funil (`month`, `status`, `q`) |
| `PATCH /opportunities/:id/status` | `ABERTA` \| `DECLINOU` \| `PROXIMO_MES` |
| `POST /opportunities/:id/convert` | venda efetuada (forma, parcelas, datas) |
| `GET/POST /sales`, `GET/PUT/DELETE /sales/:id` | vendas efetuadas e parcelas |
| `GET/POST /receivables`, `GET/PUT/DELETE /receivables/:id`, `PATCH …/receive` · `…/unreceive` | faturamento programado |
| `GET/POST /expenses`, `GET/PUT/DELETE /expenses/:id[?series=true]`, `PATCH …/pay` · `…/unpay` | despesas |
| `GET /goals?year`, `PUT /goals/year/:year`, `PUT /goals/:month` | metas |
| `GET/PUT /settings` | taxa do cartão etc. |
| `GET /dashboard?month`, `/annual?year`, `/calendar?from&to` | visões |

## 12. Limitações
- Um único usuário, sem perfis de acesso.
- Os dias úteis consideram só os feriados nacionais, não os estaduais e municipais.
- Não há conciliação bancária nem importação de extrato.
