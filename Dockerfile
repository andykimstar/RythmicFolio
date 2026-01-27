# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any exact references to packages from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Make port 8080 available to the world outside this container (Cloud Run expects 8080 by default)
EXPOSE 8080

# Run app.py using gunicorn when the container launches
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
