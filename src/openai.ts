import OpenAI from "openai";
import { config } from "dotenv";

// Load environment variables from .env file
// .env dosyasından ortam değişkenlerini yükle
config();

// Initialize OpenAI client
// OpenAI istemcisini başlat
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define tool schemas
// Araç şemalarını tanımla
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
      name: "remove_all_todos",
      description: "Remove all items from your todo list",
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
  {
    type: "function" as const,
    function: {
      name: "add_todo_to_calendar",
      description: "Add a todo item to your calendar with a specific date and time",
      parameters: {
        type: "object",
        properties: {
          todoId: {
            type: "integer",
            description: "The ID of the todo item to add to calendar",
          },
          date: {
            type: "string",
            description: "The date for the calendar event in DD-MM-YYYY format",
          },
          time: {
            type: "string",
            description: "The time for the calendar event in HH:MM or HH.MM format (24-hour)",
          },
        },
        required: ["todoId", "date", "time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_calendar_events",
      description: "Get all calendar events or events for a specific date",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Optional: The date to filter events by in DD-MM-YYYY format",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_todo_to_google_calendar",
      description: "Add a todo item to Google Calendar with a specific date and time",
      parameters: {
        type: "object",
        properties: {
          todoId: {
            type: "integer",
            description: "The ID of the todo item to add to Google Calendar",
          },
          date: {
            type: "string",
            description: "The date for the calendar event in DD-MM-YYYY format",
          },
          time: {
            type: "string",
            description: "The time for the calendar event in HH:MM or HH.MM format (24-hour)",
          },
          durationMinutes: {
            type: "integer",
            description: "Optional: The duration of the event in minutes (default: 60)",
          },
        },
        required: ["todoId", "date", "time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_google_calendar_events",
      description: "Get events from Google Calendar for a specific date or upcoming events",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Optional: The date to filter events by in DD-MM-YYYY format",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "setup_google_calendar",
      description: "Setup Google Calendar integration by providing OAuth credentials",
      parameters: {
        type: "object",
        properties: {
          credentials: {
            type: "string",
            description: "The JSON credentials string from Google Cloud Console",
          },
        },
        required: ["credentials"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "authenticate_google_calendar",
      description: "Complete Google Calendar authentication with the provided code",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The authentication code received from Google OAuth flow",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_google_calendar_auth",
      description: "Check if Google Calendar is authenticated",
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
      name: "add_event_to_google_calendar",
      description: "Add an event directly to Google Calendar without creating a todo first",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the event",
          },
          description: {
            type: "string",
            description: "The description of the event",
          },
          date: {
            type: "string",
            description: "The date for the calendar event in DD-MM-YYYY format",
          },
          time: {
            type: "string",
            description: "The time for the calendar event in HH:MM or HH.MM format (24-hour)",
          },
        },
        required: ["title", "date", "time"],
      },
    },
  },
];

// Function to create or get the assistant
// Asistanı oluşturan veya mevcut olanı getiren fonksiyon
export async function getOrCreateAssistant() {
  try {
    // Try to find an existing assistant with the name "TodoAssistant"
    // "TodoAssistant" adında mevcut bir asistan bulmaya çalış
    const assistants = await openai.beta.assistants.list({
      limit: 100,
    });

    const existingAssistant = assistants.data.find(
      (assistant) => assistant.name === "TodoAssistant"
    );

    if (existingAssistant) {
      console.log("Found existing TodoAssistant");
      
      // Update the existing assistant with the new tools
      // Mevcut asistanı yeni araçlarla güncelle
      const updatedAssistant = await openai.beta.assistants.update(
        existingAssistant.id,
        {
          tools: todoTools,
          instructions: "You are a helpful assistant that manages todos and calendar events. You can add, remove, and list todo items, as well as add todo items to a calendar with specific dates and times. You can integrate with Google Calendar to add events to the user's real calendar. If the user has already authenticated with Google Calendar, you can directly add events to their Google Calendar without asking them to authenticate again. Always be concise and respond quickly.",
          model: "gpt-3.5-turbo-0125" // Faster model
        }
      );
      
      console.log("Updated assistant with new tools");
      return updatedAssistant;
    }

    // Create a new assistant if none exists
    // Mevcut değilse yeni bir asistan oluştur
    console.log("Creating new TodoAssistant");
    const assistant = await openai.beta.assistants.create({
      name: "TodoAssistant",
      instructions: "You are a helpful assistant that manages todos and calendar events. You can add, remove, and list todo items, as well as add todo items to a calendar with specific dates and times. You can integrate with Google Calendar to add events to the user's real calendar. If the user has already authenticated with Google Calendar, you can directly add events to their Google Calendar without asking them to authenticate again. Always be concise and respond quickly.",
      model: "gpt-3.5-turbo-0125", // Faster model
      tools: todoTools,
    });

    return assistant;
  } catch (error) {
    console.error("Error creating/getting assistant:", error);
    throw error;
  }
}

export { openai };