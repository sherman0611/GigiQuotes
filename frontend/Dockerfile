# # Stage 1: Build
# FROM node:18-alpine as build-stage
# WORKDIR /app
# COPY package*.json ./
# RUN npm install
# COPY . .
# RUN npm run build

# # Stage 2: Serve with Nginx
# FROM nginx:alpine
# COPY --from=build-stage /app/dist /usr/share/nginx/html
# EXPOSE 80
# CMD ["nginx", "-g", "daemon off;"]

# Stage 1: Build
FROM node:20-alpine as build-stage
WORKDIR /app

# 1. Copy package files FIRST (this speeds up builds)
COPY frontend/package*.json ./

# 2. Run install
RUN npm install

# 3. Copy the rest of the frontend source code
COPY frontend/ . 

# 4. Build the project
RUN npm run build

# Stage 2: Production Server (Nginx)
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
# Copy the actual production build files
COPY --from=build-stage /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]