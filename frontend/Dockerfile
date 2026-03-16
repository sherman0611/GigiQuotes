FROM node:20-slim

WORKDIR /app

# Point to the frontend subfolder
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy everything from the frontend folder into the container
COPY frontend/ .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]