FROM node:24-alpine
ENV NODE_ENV=production QSL_HOST=0.0.0.0 QSL_PORT=8787 QSL_DATA_DIR=/var/lib/qslink QSL_SEED_DEMO=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY public ./public
RUN mkdir -p /var/lib/qslink && chown node:node /var/lib/qslink
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
