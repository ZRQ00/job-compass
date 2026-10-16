FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=/jobcompass/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
# Remove nginx's default placeholder page
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/client /usr/share/nginx/html

# TanStack SPA mode may name the shell _shell.html; nginx wants index.html
RUN cd /usr/share/nginx/html \
 && if [ -f _shell.html ] && [ ! -f index.html ]; then mv _shell.html index.html; fi \
 && test -f index.html || (echo "ERROR: no index.html in build output" && ls -la && exit 1)

# SPA fallback so refreshing deep links works
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80