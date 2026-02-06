# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any exact references to packages from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Create a writable cache directory for yfinance/matplotlib
RUN mkdir -p /tmp/runtime-user
ENV XDG_CACHE_HOME=/tmp/runtime-user

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Run app.py using gunicorn when the container launches
# We use --chdir to point to the directory containing app.py so imports work correctly
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--chdir", "src/server", "app:app"]

