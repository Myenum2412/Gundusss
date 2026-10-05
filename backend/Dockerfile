FROM node:20-alpine
WORKDIR /app
COPY package.json ./
# Skip Puppeteer Chrome download; use system Chromium instead.
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN apk add --no-cache chromium && npm install
COPY . .
RUN npm run build
ENV CHROME_PATH=/usr/bin/chromium-browser
EXPOSE 4000
CMD ["npm", "start"]
