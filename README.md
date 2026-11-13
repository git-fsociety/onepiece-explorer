# One Piece Explorer

Interface web em português para explorar a [One Piece API](https://onepieceapi.com/documentation): personagens em cartazes de **PROCURADO**, Akuma no Mi, recompensas, navios, ilhas e afiliações.

![CI](https://github.com/SEU-USUARIO/SEU-REPOSITORIO/actions/workflows/ci.yml/badge.svg)

> Troque `SEU-USUARIO/SEU-REPOSITORIO` no link acima pelo caminho do seu repositório para o selo da pipeline funcionar.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Como funciona](#como-funciona)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rodando localmente](#rodando-localmente)
- [Rodando com Docker](#rodando-com-docker)
- [Pipeline de CI (GitHub Actions)](#pipeline-de-ci-github-actions)
- [Segurança](#segurança)
- [Problemas comuns](#problemas-comuns)

---

## Funcionalidades

- **Personagens:** cartazes de procurado com foto, recompensa, idade, altura e carimbo de "FALECIDO". Tem busca por nome (inglês, japonês ou romaji), filtro por faixa etária e a opção "Só com imagem".
- **Ficha do personagem:** ao clicar num cartaz, abre uma ficha com ocupação, afiliação, origem, primeira aparição e histórico de recompensas.
- **Akuma no Mi, Navios e Ilhas:** exibidos em cards.
- **Recompensas:** ordenadas por valor ou data e filtradas entre ativas e antigas.
- **Afiliações:** ordenadas por número de membros.
- **Tudo em português:** os dados da API são traduzidos com dicionário e padrões, como "Straw Hat Pirates" → "Piratas do Chapéu de Palha".
- **Tema claro e escuro.**
- **Filtros na URL:** dá para compartilhar uma visualização pelo link.

## Como funciona

```
Navegador  ──►  server.js (seu computador ou container)  ──►  www.onepieceapi.com
 (página)        entrega a página + repassa chamadas            (API pública)
```

A One Piece API não permite chamadas feitas direto do navegador a partir de outros sites, porque não envia o cabeçalho de CORS. Por isso, o `server.js` faz duas coisas:

1. Entrega a página (`public/index.html`).
2. Funciona como **proxy**: recebe as chamadas da página em `/api/...`, valida tudo e repassa para a API oficial.

O projeto **não tem dependências npm**: usa só o Node.js.

## Estrutura do projeto

```
onepiece-explorer/
├── .github/
│   └── workflows/
│       └── ci.yml          # pipeline do GitHub Actions
├── public/
│   └── index.html          # a interface (HTML + CSS + JavaScript)
├── .dockerignore           # o que NÃO entra na imagem Docker
├── .gitignore              # o que NÃO vai para o Git
├── docker-compose.yml      # sobe o projeto com um comando
├── Dockerfile              # receita da imagem Docker
├── package.json            # nome, versão e script "npm start"
├── README.md               # este arquivo
└── server.js               # servidor + proxy da API
```

## Rodando localmente

**Pré-requisito:** [Node.js](https://nodejs.org/) 18 ou mais recente. Confira com:

```bash
node --version
```

**Para iniciar:**

```bash
npm start
```

Depois abra **http://127.0.0.1:3000**. Para parar, use `Ctrl+C`.

**Variáveis opcionais:**

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `HOST` | `127.0.0.1` | Endereço em que o servidor escuta. Use `0.0.0.0` só dentro de container |

Exemplo: `PORT=8080 npm start`

## Rodando com Docker

**Pré-requisito:** [Docker](https://docs.docker.com/get-docker/) instalado.

### Opção 1 — Docker Compose (mais simples)

```bash
docker compose up -d --build   # monta a imagem e sobe em segundo plano
docker compose logs -f         # acompanha os logs (Ctrl+C sai dos logs)
docker compose down            # para e remove o container
```

### Opção 2 — Docker puro

```bash
docker build -t onepiece:1.0 .
docker run -d --name onepiece -p 127.0.0.1:3000:3000 onepiece:1.0
```

Comandos úteis:

```bash
docker ps                 # lista containers rodando
docker logs onepiece      # mostra os logs
docker stop onepiece      # para o container
docker rm onepiece        # remove o container
```

Nos dois casos, abra **http://127.0.0.1:3000**.

> **Por que `127.0.0.1:` na porta?** Assim a aplicação fica acessível só no seu computador. Com `-p 3000:3000`, qualquer pessoa na mesma rede (por exemplo, o Wi-Fi) conseguiria acessar.

## Pipeline de CI (GitHub Actions)

O arquivo `.github/workflows/ci.yml` roda automaticamente no GitHub:

| Quando | O que roda |
|---|---|
| Push na branch `main` | Testes → Docker → Publicar imagem |
| Pull request para a `main` | Testes → Docker (não publica) |
| Botão "Run workflow" na aba **Actions** | Igual ao push |

### As etapas

1. **Testes:** confere a sintaxe do `server.js` e do JavaScript da página. Depois sobe o servidor e faz testes rápidos:
   - a página responde `200`;
   - o cabeçalho de segurança (CSP) está presente;
   - parâmetros inválidos recebem `400`;
   - métodos diferentes de GET recebem `405`.
2. **Docker:** monta a imagem, sobe o container, confere se responde e se **não roda como root**. Depois procura vulnerabilidades graves na imagem com o [Trivy](https://trivy.dev/).
3. **Publicar:** só roda na `main`. Envia a imagem para o GitHub Container Registry como `ghcr.io/SEU-USUARIO/onepiece-explorer:latest`.

### Como ativar

```bash
git init
git add .
git commit -m "Primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Depois, abra a aba **Actions** do repositório no GitHub para acompanhar a execução.

Você **não precisa criar nenhum secret**: a publicação usa o `GITHUB_TOKEN`, que o GitHub cria automaticamente a cada execução.

### Usando a imagem publicada

```bash
docker pull ghcr.io/SEU-USUARIO/onepiece-explorer:latest
docker run -d -p 127.0.0.1:3000:3000 ghcr.io/SEU-USUARIO/onepiece-explorer:latest
```

> Por padrão, a imagem publicada fica **privada**. Para torná-la pública: no GitHub, vá em **Packages** → `onepiece-explorer` → **Package settings** → **Change visibility**.

## Segurança

**Proxy e servidor:**

- **Endereço fixo:** o proxy só repassa para `www.onepieceapi.com`.
- **Lista branca:** só aceita endpoints e parâmetros conhecidos. Todo o resto recebe `400`.
- **Limites:** timeout de 8 s, resposta de no máximo 2 MB e limite de 120 requisições por minuto por IP.
- **Erros genéricos:** o navegador nunca vê detalhes internos. Eles ficam só no log do servidor.
- **Cabeçalhos de segurança:** CSP com hashes (sem `unsafe-inline`), `X-Frame-Options`, `nosniff` e `Referrer-Policy`.

**Página:**

- **Dados como texto:** os dados da API são exibidos sempre com `textContent`, nunca com `innerHTML`, o que evita XSS.
- **Imagens:** só aceita endereços `https`.

**Docker:**

- **Sem root:** o container roda com o usuário `node`.
- **Porta só local:** fica publicada apenas em `127.0.0.1`.
- **`.dockerignore`:** impede que `.git`, `.env` e outros arquivos sensíveis entrem na imagem.

**Pipeline:**

- **Permissões mínimas:** só o job de publicação pode enviar pacotes.
- **Sem senhas no código:** usa o `GITHUB_TOKEN` automático.
- **Scan de vulnerabilidades:** o Trivy verifica a imagem a cada execução.

> **Para ir além:** fixe as actions por SHA do commit em vez da versão, como `actions/checkout@<sha>`, e ative o Dependabot para atualizá-las automaticamente.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Não foi possível conectar à API" | O `server.js` parou | Rode `npm start` de novo e veja o erro no terminal |
| `EADDRINUSE` ao iniciar | A porta 3000 já está em uso | Feche o outro processo ou use `PORT=3001 npm start` |
| A página não abre no Docker | Falta `HOST=0.0.0.0` no container | Já está configurado no `Dockerfile`; confira se não foi removido |
| Cartazes sem foto | A API não tem imagem desses personagens | Use o filtro "Só com imagem" |
| A pipeline falha no Trivy | Há vulnerabilidade grave na imagem base | Rode a pipeline de novo mais tarde ou atualize a imagem base no `Dockerfile` |
| Erro de permissão ao publicar | O repositório bloqueia a escrita de pacotes | **Settings → Actions → General → Workflow permissions** → "Read and write" |

## Licença

MIT. Os dados vêm da [One Piece API](https://onepieceapi.com/), um projeto open source.