# Use your exact Python version
FROM python:3.12.3-slim

# Install system dependencies required to compile psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements file from the backend directory
COPY ../requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Expose the Flask port
EXPOSE 5000

# Ensure Flask is visible outside the container
CMD ["python", "app.py"]