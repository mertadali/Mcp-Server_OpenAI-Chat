import express from "express";
import cors from "cors";
import { openai, getOrCreateAssistant } from "./openai.js";
import { executeToolCalls } from "./tools.js";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "../public")));

// Store threads in memory (in a production app, this would be in a database)
const userThreads = new Map<string, string>();

// Initialize the assistant
let assistant: any;
(async () => {
  try {
    assistant = await getOrCreateAssistant();
    console.log(`Assistant initialized with ID: ${assistant.id}`);
  } catch (error) {
    console.error("Failed to initialize assistant:", error);
    process.exit(1);
  }
})();

// Create or get a thread for a user
app.post("/api/thread", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    
    let threadId = userThreads.get(userId);
    
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(userId, threadId);
    }
    
    res.json({ threadId });
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Failed to create or get thread" });
  }
});

// Send a message and get a response
app.post("/api/chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }
    
    let threadId = userThreads.get(userId);
    
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(userId, threadId);
    }
    
    // Check for any active runs and cancel them before proceeding
    try {
      const runs = await openai.beta.threads.runs.list(threadId);
      const activeRuns = runs.data.filter(run => 
        run.status === "in_progress" || 
        run.status === "queued" || 
        run.status === "requires_action"
      );
      
      // Cancel any active runs
      for (const run of activeRuns) {
        try {
          await openai.beta.threads.runs.cancel(threadId, run.id);
          console.log(`Cancelled active run: ${run.id}`);
        } catch (cancelError) {
          console.error(`Error cancelling run ${run.id}:`, cancelError);
          // Continue even if cancellation fails
        }
      }
    } catch (listRunsError) {
      console.error("Error listing runs:", listRunsError);
      // Continue even if listing runs fails
    }
    
    // Add user message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistant.id,
    });
    
    // Poll for completion
    let runStatus = await pollRunStatus(threadId, run.id);
    
    // Check if tool calls are required
    if (runStatus.status === "requires_action" && 
        runStatus.required_action?.type === "submit_tool_outputs") {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      
      // Instead of executing tool calls automatically, send them to the client for approval
      return res.json({
        requiresAction: true,
        toolCalls: toolCalls,
        threadId,
        runId: run.id
      });
    }
    
    // Get the assistant's messages
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Find the most recent assistant message
    const assistantMessages = messages.data
      .filter(msg => msg.role === "assistant")
      .sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    
    if (assistantMessages.length === 0) {
      return res.status(500).json({ error: "No assistant response found" });
    }
    
    // Format and return the response
    const latestMessage = assistantMessages[0];
    const content = latestMessage.content.map(item => {
      if (item.type === "text") {
        return item.text.value;
      }
      return "";
    }).join("");
    
    res.json({ 
      response: content, 
      threadId,
      requiresAction: false
    });
  } catch (error) {
    console.error("Error in chat:", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

// Helper function to poll run status
async function pollRunStatus(threadId: string, runId: string) {
  let runStatus;
  
  while (true) {
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    if (
      runStatus.status === "completed" ||
      runStatus.status === "failed" ||
      runStatus.status === "requires_action"
    ) {
      break;
    }
    
    // Wait for 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return runStatus;
}

// Get chat history for a thread
app.get("/api/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const threadId = userThreads.get(userId);
    
    if (!threadId) {
      return res.status(404).json({ error: "No thread found for this user" });
    }
    
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Format messages
    const formattedMessages = messages.data.map(msg => {
      const content = msg.content.map(item => {
        if (item.type === "text") {
          return item.text.value;
        }
        return "";
      }).join("");
      
      return {
        role: msg.role,
        content,
        created_at: msg.created_at
      };
    });
    
    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// Handle tool approval or denial
app.post("/api/tool-response", async (req, res) => {
  try {
    const { threadId, runId, approved, toolCalls } = req.body;
    
    if (!threadId || !runId) {
      return res.status(400).json({ error: "threadId and runId are required" });
    }
    
    if (approved) {
      // Execute the approved tool calls
      const toolOutputs = await executeToolCalls(toolCalls);
      
      // Submit tool outputs back to the run
      await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
        tool_outputs: toolOutputs,
      });
      
      // Continue polling until complete
      const runStatus = await pollRunStatus(threadId, runId);
      
      // Get the assistant's messages
      const messages = await openai.beta.threads.messages.list(threadId);
      
      // Find the most recent assistant message
      const assistantMessages = messages.data
        .filter(msg => msg.role === "assistant")
        .sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      
      if (assistantMessages.length === 0) {
        return res.status(500).json({ error: "No assistant response found" });
      }
      
      // Format and return the response
      const latestMessage = assistantMessages[0];
      const content = latestMessage.content.map(item => {
        if (item.type === "text") {
          return item.text.value;
        }
        return "";
      }).join("");
      
      res.json({ 
        response: content, 
        threadId,
        requiresAction: false
      });
    } else {
      // If denied, cancel the run and inform the user
      await openai.beta.threads.runs.cancel(threadId, runId);
      
      res.json({
        response: "The requested action was denied. How else can I help you?",
        threadId,
        requiresAction: false
      });
    }
  } catch (error) {
    console.error("Error handling tool response:", error);
    res.status(500).json({ error: "Failed to process tool response" });
  }
});

// Serve the main HTML file for any other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to use the Todo Assistant`);
});