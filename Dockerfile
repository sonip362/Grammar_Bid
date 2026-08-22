FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Hugging Face Spaces default port
EXPOSE 7860
ENV PORT=7860

CMD ["npm", "start"]
