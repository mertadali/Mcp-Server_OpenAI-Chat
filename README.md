# OpenAI Todo Assistant Server

A full-stack application that uses OpenAI's Assistant API to manage a todo list. The application includes a Node.js Express server backend and a responsive web frontend.

## Features

- Chat-based interface to manage your todo list
- Powered by OpenAI's GPT-4o Assistant API
- SQLite database for persistent storage
- Responsive web interface
- Support for adding, removing, listing, and toggling todo items
- Tool approval workflow for sensitive operations

## Technical Stack

- **Backend**: Node.js with Express
- **Frontend**: HTML, CSS, JavaScript
- **Database**: SQLite (via better-sqlite3)
- **AI**: OpenAI Assistant API with GPT-4o model
- **Language**: TypeScript

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
3. For development with auto-reloading:
   ```
   npm run dev
   ```

The server will be available at http://localhost:3000.

## Database

The application uses SQLite to store todo items. The database file is created at `~/openai-todos/todos.db` and includes a table for storing todo items with the following schema:

- `id`: Unique identifier for each todo item
- `text`: The content of the todo item
- `completed`: Boolean flag indicating completion status
- `createdAt`: Timestamp when the todo was created

## API Endpoints

- `POST /api/thread` - Create or get a thread for a user
- `POST /api/chat` - Send a message and get a response
- `GET /api/history/:userId` - Get chat history for a user
- `POST /api/tool-response` - Handle tool approval or denial

## Available Tools

The assistant has access to the following tools:

- `add_todo` - Add a new item to the todo list
- `get_todos` - Get all items from the todo list
- `remove_todo` - Remove an item from the todo list by ID
- `toggle_todo` - Toggle the completion status of a todo item

## Usage Examples

You can interact with the assistant using natural language. Here are some examples:

- "Add 'Buy groceries' to my todo list"
- "Show me all my todos"
- "Mark todo #3 as complete"
- "Remove todo #2 from my list"
- "What's on my todo list?"

## License

MIT 