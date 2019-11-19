FROM node:12

WORKDIR /usr/src/app/

ADD ./deployer/ deployer/

WORKDIR /usr/src/app/deployer

RUN mkdir -p dist

COPY ./dist/ dist/

RUN ls dist/

ENTRYPOINT ["yarn", "pm2", "start", "ecosystem.config.js", "--no-daemon"]

EXPOSE 8443
