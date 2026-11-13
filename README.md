# One Piece Explorer

Interface para a [One Piece API](https://onepieceapi.com/documentation).

## Por que um servidor?

A API não envia o cabeçalho `Access-Control-Allow-Origin`, então o navegador bloqueia chamadas feitas direto da página (erro de CORS). O `server.js` entrega a interface e repassa à API apenas requisições `GET` válidas, pela mesma origem.

## Como rodar

Requer Node.js 18 ou mais recente. Não há dependências para instalar.

```bash
npm start            # ou: node server.js
```

Abra http://127.0.0.1:3000

Variáveis opcionais: `PORT` (padrão `3000`) e `HOST` (padrão `127.0.0.1`).

## Segurança

- **Proxy restrito:** o host da API é fixo e só aceita endpoints e parâmetros de uma lista branca. Valores como `page`, `limit`, `ageBand`, `sort` e o UUID são validados. Qualquer outra coisa recebe `400`.
- **Limites:** requisições ao upstream têm timeout de 8 s e resposta de no máximo 2 MB. Redirecionamentos são bloqueados e a resposta precisa ser JSON válido.
- **Rate limit e cache:** 120 requisições por minuto por IP, com cache em memória de 60 s.
- **Cabeçalhos:** CSP com hashes (sem `unsafe-inline`), `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e HSTS (vale quando houver HTTPS na frente).
- **Erros:** o cliente recebe só mensagens genéricas. Os detalhes ficam apenas no log do servidor.
- **Frontend:** os dados da API são exibidos sempre como texto (`textContent`) e só aceita imagens `https`.
- **Rede:** por padrão o servidor escuta só em `127.0.0.1`. Para expor na rede, coloque um proxy reverso com TLS na frente.
