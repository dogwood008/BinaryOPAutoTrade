FROM zenika/alpine-chrome:77-with-puppeteer
LABEL maintainer "dogwood008 <dogwood008+github@gmail.com>"
ARG user=chrome

USER root
# https://qiita.com/dd511805/items/dfe03c5486bf1421875a
RUN mkdir /noto
WORKDIR /noto
RUN apk add --update curl@edge && \
    curl -SL -O \
      https://noto-website.storage.googleapis.com/pkgs/NotoSansCJKjp-hinted.zip && \
    unzip NotoSansCJKjp-hinted.zip && \
    mkdir -p /usr/share/fonts/noto && \
    cp *.otf /usr/share/fonts/noto && \
    chmod 644 -R /usr/share/fonts/noto/ && \
    fc-cache -fv && \
    rm -rf /noto && \
    apk del curl

USER root
RUN mkdir -p /app/node_modules && chown -R $user:$user /app/node_modules

# Run everything after as non-privileged user.
USER $user

RUN mkdir -p /tmp/app
COPY --chown=$user:$user ./package.json /tmp/app/package.json
COPY --chown=$user:$user ./package-lock.json /tmp/app/package-lock.json
WORKDIR /tmp/app
RUN npm install
RUN cp -r /tmp/app/node_modules/* /app/node_modules/ && \
    rm -rf /tmp/app

WORKDIR /app
RUN pwd && date
ADD ./ /app
CMD node ./server.js

