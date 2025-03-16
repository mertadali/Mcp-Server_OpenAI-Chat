import OpenAI from "openai";
import { config } from "dotenv";

// Load environment variables from .env file
config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define tool schemas
export const todoTools = [
  {
    type: "function" as const,
    function: {
      name: "add_todo",
      description: "Add a new item to your todo list",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text of the todo item",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_todos",
      description: "Get all items from your todo list",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_todo",
      description: "Remove an item from your todo list by ID",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "The ID of the todo item to remove",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toggle_todo",
      description: "Toggle the completion status of a todo item",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "The ID of the todo item to toggle",
          },
        },
        required: ["id"],
      },
    },
  },
];

// Function to create or get the assistant
export async function getOrCreateAssistant() {
  try {
    // Try to find an existing assistant with the name "TodoAssistant"
    const assistants = await openai.beta.assistants.list({
      limit: 100,
    });

    const existingAssistant = assistants.data.find(
      (assistant) => assistant.name === "TodoAssistant"
    );

    if (existingAssistant) {
      console.log("Found existing TodoAssistant");
      return existingAssistant;
    }

    // Create a new assistant if none exists
    console.log("Creating new TodoAssistant");
    const assistant = await openai.beta.assistants.create({
      name: "TodoAssistant",
      instructions: "You are a helpful assistant that manages a todo list. You can add, remove, and list todo items. Always be concise and helpful.",
      model: "gpt-4o",
      tools: todoTools,
    });

    return assistant;
  } catch (error) {
    console.error("Error creating/getting assistant:", error);
    throw error;
  }
}

export { openai };