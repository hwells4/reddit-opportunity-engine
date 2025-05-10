FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt openai

COPY . .

EXPOSE 8000

# Make the onboarding script executable
RUN chmod +x onboarding.py

# Default command will run the onboarding script
CMD ["python", "onboarding.py"]

# Alternative commands:
# Run the direct OpenRouter script
# CMD ["python", "direct_openrouter.py"]
# Run the API server
# CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"] 