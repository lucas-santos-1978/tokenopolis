# Tokenopolis

**Uma cidade 3D viva que cresce com o uso de IA do seu time.**

O Tokenopolis transforma as métricas de tokens do Claude Code num jogo para deixar rodando na TV
do escritório. Cada time é uma cidade, cada pessoa um prédio e cada milhão de tokens um andar. Uma
segunda vista, a **Escalada**, é uma corrida diária por um paredão de montanha. Tudo em Node +
three.js puros, sem dependências nem build, em inglês e português do Brasil.

[English](README.md) · [Recursos](docs/features.md) · [Configuração](docs/configuration.md) ·
[Fontes de dados](docs/data-sources.md) · [API](docs/contract.md) · [Publicação](docs/deployment.md)

A documentação detalhada está em inglês; a interface do painel tem as duas línguas.

## Começando

```bash
git clone https://github.com/lucas-santos-1978/tokenopolis.git
cd tokenopolis
npm run mock
```

Abra http://localhost:3000/?lang=pt-BR para a cidade (dados gerados), http://localhost:3000/?demo
para a região de demonstração (uma centena de cidades, três mil prédios) e
http://localhost:3000/climb.html para a escalada. O seletor 🌐 no cabeçalho troca a língua e
lembra a escolha. Precisa do Node 22.15 ou mais novo; nada é instalado.

## Com dados reais

1. Copie `.env.example` para `.env`.
2. Aponte para os seus dados. De fábrica o Tokenopolis lê as métricas OpenTelemetry do Claude Code
   no **Datadog** (`DD_ACCESS_TOKEN` ou `DD_API_KEY` + `DD_APP_KEY`). Qualquer outro sistema entra
   por um **arquivo JSON de registros diários** (`DATA_SOURCE=file`) ou um **módulo seu**
   (`DATA_SOURCE=./minha-fonte.js`). Veja [docs/data-sources.md](docs/data-sources.md).
3. `npm start`.

Arquivos locais opcionais, todos ignorados pelo git: `team.json` (quem participa),
`nicknames.json` (nomes, avatares, fotos) e `belts.json` (o programa de faixas). Há um exemplo de
cada ao lado.

## O que vem na caixa

- **A cidade** (`/`): uma região 3D onde as cidades crescem de vila a colônia em Marte e os prédios
  de casa a elevador espacial, com monumentos pelas conquistas da semana, jornal, contagens
  regressivas, prefeito do mês, mapas de dados (quem constrói agora, obras da semana, o modelo que
  cada um mais usa, o programa de faixas), time-lapse desde o primeiro dia e corrida das cidades.
  Prédio abandonado pega fogo depois de 15 dias sem Claude e vira escombros depois de 30. Modo tour
  para TV, layout de celular, montador de links com todos os parâmetros e uma região de demonstração.
- **A escalada** (`/climb.html`): a etapa do dia num paredão de rocha. Todo mundo sai do
  acampamento base à meia-noite; a marca do dia é a mediana dos últimos vencedores; os recordes
  viram placas na rocha; a classificação da semana dá o campeão, as badges e o hall da fama. Cartão
  PNG para compartilhar.
- **Privacidade de fábrica**: o navegador só recebe ids curtos, nomes (ou identidades anônimas como
  "Lhama Veloz", com `ANONYMIZE=true`), andares e horários. E-mails e credenciais nunca saem do
  servidor. O painel pode ficar atrás de uma senha.

## Configuração resumida

| Variável | O que faz |
|---|---|
| `APP_NAME` | O nome mostrado em todo lugar (padrão `Tokenopolis`) |
| `LOCALE` | Língua inicial, `en` ou `pt-BR`; cada visitante pode trocar |
| `TIMEZONE` | Fuso IANA dos dias, semanas e meses (padrão: o da máquina) |
| `DATA_SOURCE` | `datadog`, `mock`, `demo`, `file` ou o caminho de um módulo |
| `CITIES_START`, `CITY_FLOOR_TOKENS`, `CITY_NAMES` | Desde quando os andares contam, tokens por andar, nomes dos times |
| `SCORE_TYPES`, `MIN_TOKENS`, `TOP_N`, `SEASON_LENGTH` | O que conta, quem participa, como a temporada roda |
| `PANEL_PASSWORD`, `ANONYMIZE`, `ID_SALT` | Acesso e privacidade |

Tudo, com os padrões, em [docs/configuration.md](docs/configuration.md) e no `.env.example`.

## Licença

MIT, veja [LICENSE](LICENSE). Os recursos de terceiros e suas licenças estão em
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
