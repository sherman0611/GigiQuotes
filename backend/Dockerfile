# Use a slim Python image for a smaller footprint
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies needed for psycopg2 (Postgres driver)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything from the backend folder into /app
# Since context is '.', we copy the contents of the backend directory
COPY backend/ .

# Expose the port your Flask/FastAPI app runs on
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]