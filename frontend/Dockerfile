# Frontend estático servido pelo Nginx
FROM nginx:1.25-alpine

# Remove config padrão
RUN rm /etc/nginx/conf.d/default.conf

# Config customizada
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copia as telas HTML
COPY html/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1
