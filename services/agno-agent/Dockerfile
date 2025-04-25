FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt openai duckduckgo-search

COPY . .

EXPOSE 8000

# Default command will run the direct OpenRouter script
CMD ["python", "direct_openrouter.py"]

# Alternative command to run the API server
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 