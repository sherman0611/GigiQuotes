FROM node:20-slim

WORKDIR /app

# Copy package files first to use Docker cache
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Vite's default dev port
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]