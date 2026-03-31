FROM node:20-alpine

WORKDIR /app

# Install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy application code
COPY mediatorConfig.json ./
COPY src ./src

EXPOSE 3001

# Run node directly — no npm overhead, no nodemon in prod
CMD ["npm", "start"]