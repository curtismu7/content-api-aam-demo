FROM nginx:alpine
COPY demo-page/index.html demo-page/format.js demo-page/app.js /usr/share/nginx/html/
COPY demo-page/templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY demo-page/docker-entrypoint.sh /docker-entrypoint-demo.sh
RUN chmod +x /docker-entrypoint-demo.sh
ENTRYPOINT ["/docker-entrypoint-demo.sh"]
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 80
