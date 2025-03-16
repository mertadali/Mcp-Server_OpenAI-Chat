# OpenAI Todo Assistant Server

A simple Express server that uses OpenAI's Assistant API to manage a todo list.

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
4. Replace `your_openai_api_key_here` with your actual OpenAI API key

## Running the server

1. Build the TypeScript code:
   ```
   npm run build
   ```
2. Start the server:
   ```
   npm start
   ```

The server will be available at http://localhost:3000.

## API Endpoints

- `POST /api/thread` - Create or get a thread for a user
- `POST /api/chat` - Send a message and get a response
- `GET /api/history/:userId` - Get chat history for a user 