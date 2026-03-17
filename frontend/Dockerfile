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

# Copy package files from frontend/ folder
COPY package*.json ./
RUN npm install

# Copy source from frontend/ folder
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
# Remove default Nginx files to prevent the "Welcome" page
RUN rm -rf /usr/share/nginx/html/*
# Copy the actual production build files
COPY --from=build-stage /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]