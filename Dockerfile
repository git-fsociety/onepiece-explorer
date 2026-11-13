# 1. Imagem base com Node.js já instalado
FROM node:22-alpine

# 2. Pasta de trabalho dentro do container
WORKDIR /app

# 3. Copia os arquivos do projeto para dentro da imagem
COPY . .

# 4. Faz o servidor aceitar conexões de fora do container
ENV HOST=0.0.0.0

# 5. Não roda como root (usuário que já vem na imagem oficial)
USER node

# 6. Documenta a porta usada
EXPOSE 3000

# 7. Comando que inicia a aplicação
CMD ["node", "server.js"]