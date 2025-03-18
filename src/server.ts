import express from "express";
import cors from "cors";
import { openai, getOrCreateAssistant } from "./openai.js";
import { executeToolCalls } from "./tools.js";
import path from "path";
import { fileURLToPath } from "url";
import { processMCPRequest, setOpenAIBridge } from "./mcpHandler.js";
import { MCPErrors, MCP_VERSION, convertToolsToMCPFormat } from "./mcp.js";

// Check if MCP is enabled
const isMCPEnabled = process.env.MCP_ENABLED === 'true';
console.log(`MCP Protocol: ${isMCPEnabled ? 'Enabled' : 'Disabled'}`);

// Get the directory name
// Dosya yolunu al
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
// Public klasöründeki statik dosyaları sunmak için
app.use(express.static(path.join(__dirname, "../public")));

// Store threads in memory (in a production app, this would be in a database)
// Kullanıcı thread'lerini hafızada sakla (gerçek uygulamada veritabanında olmalı)
const userThreads = new Map<string, string>();

// Initialize the assistant
// OpenAI asistanını başlat
let assistant: any;
(async () => {
  try {
    assistant = await getOrCreateAssistant();
    console.log(`Assistant initialized with ID: ${assistant.id}`);
    
    // Set up the OpenAI bridge for MCP if enabled
    if (isMCPEnabled) {
      setOpenAIBridge({
        userThreads,
        assistantId: assistant.id,
        executeToolCall: async (toolCall) => {
          const results = await executeToolCalls([toolCall]);
          return results[0].output;
        }
      });
    }
  } catch (error) {
    console.error("Failed to initialize assistant:", error);
    process.exit(1);
  }
})();

// Create or get a thread for a user
// Kullanıcı için thread oluştur veya mevcut olanı getir
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
// Mesaj gönder ve yanıt al
app.post("/api/chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }
    
    console.log(`Processing message from user ${userId}: "${message}"`);
    
    let threadId = userThreads.get(userId);
    
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      userThreads.set(userId, threadId);
      console.log(`Created new thread ${threadId} for user ${userId}`);
    }
    
    // Check for any active runs and cancel them before proceeding
    // Devam etmeden önce aktif çalışmaları kontrol et ve iptal et
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
    // Kullanıcı mesajını thread'e ekle
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
    
    // Run the assistant
    // Asistanı çalıştır
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistant.id,
    });
    
    console.log(`Started run ${run.id} for thread ${threadId}`);
    
    // Poll for completion
    // Tamamlanma durumunu kontrol et
    let runStatus = await pollRunStatus(threadId, run.id);
    console.log(`Run ${run.id} completed with status: ${runStatus.status}`);
    
    // Check if tool calls are required
    // Araç çağrıları gerekiyorsa kontrol et
    if (runStatus.status === "requires_action" && 
        runStatus.required_action?.type === "submit_tool_outputs") {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      
      // Instead of executing tool calls automatically, send them to the client for approval
      // Araç çağrılarını otomatik yürütmek yerine, onay için istemciye gönder
      return res.json({
        requiresAction: true,
        toolCalls: toolCalls,
        threadId,
        runId: run.id
      });
    }
    
    // Get the assistant's messages
    // Asistanın mesajlarını al
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Find the most recent assistant message
    // En son asistan mesajını bul
    const assistantMessages = messages.data
      .filter(msg => msg.role === "assistant")
      .sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    
    if (assistantMessages.length === 0) {
      return res.status(500).json({ error: "No assistant response found" });
    }
    
    // Format and return the response
    // Yanıtı formatla ve döndür
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
// Çalışma durumunu kontrol eden yardımcı fonksiyon
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
    // Tekrar kontrol etmeden önce 1 saniye bekle
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return runStatus;
}

// Get chat history for a thread
// Bir thread için sohbet geçmişini al
app.get("/api/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const threadId = userThreads.get(userId);
    
    if (!threadId) {
      return res.status(404).json({ error: "No thread found for this user" });
    }
    
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Format messages
    // Mesajları formatla
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
// Araç onayını veya reddini işle
app.post("/api/tool-response", async (req, res) => {
  try {
    const { threadId, runId, approved, toolCalls } = req.body;
    
    if (!threadId || !runId) {
      return res.status(400).json({ error: "threadId and runId are required" });
    }
    
    if (approved) {
      // Execute the approved tool calls
      // Onaylanan araç çağrılarını yürüt
      const toolOutputs = await executeToolCalls(toolCalls);
      
      // Submit tool outputs back to the run
      // Araç çıktılarını çalışmaya geri gönder
      await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
        tool_outputs: toolOutputs,
      });
      
      // Continue polling until complete
      // Tamamlanana kadar kontrol etmeye devam et
      const runStatus = await pollRunStatus(threadId, runId);
      
      // Get the assistant's messages
      // Asistanın mesajlarını al
      const messages = await openai.beta.threads.messages.list(threadId);
      
      // Find the most recent assistant message
      // En son asistan mesajını bul
      const assistantMessages = messages.data
        .filter(msg => msg.role === "assistant")
        .sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      
      if (assistantMessages.length === 0) {
        return res.status(500).json({ error: "No assistant response found" });
      }
      
      // Format and return the response
      // Yanıtı formatla ve döndür
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
      // Reddedilirse, çalışmayı iptal et ve kullanıcıyı bilgilendir
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

// İkinci isMCPEnabled tanımını silip, if kontrolünü güncelleyeceğim
if (isMCPEnabled) {
  console.log('MCP Protocol is enabled');
  
  // MCP endpoint
  // Model Context Protocol endpoint
  app.post("/mcp", async (req, res) => {
    try {
      // Validate request
      if (!req.body || !req.body.messages) {
        return res.status(400).json(MCPErrors.INVALID_REQUEST);
      }

      // Add MCP version if not provided
      if (!req.body.version) {
        req.body.version = MCP_VERSION;
      }

      // Add tools if not provided
      if (!req.body.tools) {
        req.body.tools = convertToolsToMCPFormat();
      }

      // Process the MCP request
      const response = await processMCPRequest(req.body);
      
      // Return the response
      res.json(response);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      res.status(500).json(MCPErrors.INTERNAL_ERROR);
    }
  });

  // MCP health check endpoint
  app.get("/mcp/health", (req, res) => {
    res.json({
      status: "ok",
      version: MCP_VERSION
    });
  });

  // MCP tool definitions endpoint
  app.get("/mcp/tools", (req, res) => {
    res.json({
      version: MCP_VERSION,
      tools: convertToolsToMCPFormat()
    });
  });
}

// Serve the main HTML file for any other routes
// Diğer tüm rotalar için ana HTML dosyasını sun

// Add Google OAuth callback route
// Google OAuth callback rotası ekle
app.get("/google/callback", (req, res) => {
  const code = req.query.code as string;
  
  if (!code) {
    return res.status(400).send("Authorization code is missing");
  }
  
  // Display a page with instructions to copy the code
  res.send(`
    <html>
      <head>
        <title>Google Calendar Authorization</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
          }
          .code-box {
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            margin: 20px 0;
            word-break: break-all;
          }
          .instructions {
            margin-bottom: 20px;
          }
          button {
            background-color: #4285f4;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <h1>Google Calendar Authorization</h1>
        <div class="instructions">
          <p>Please copy the authorization code below and paste it in the chat when prompted:</p>
        </div>
        <div class="code-box" id="auth-code">${code}</div>
        <button onclick="copyCode()">Copy Code</button>
        <p>After copying the code, you can close this window and return to the Todo Assistant.</p>
        
        <script>
          function copyCode() {
            const codeElement = document.getElementById('auth-code');
            const range = document.createRange();
            range.selectNode(codeElement);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges();
            alert('Code copied to clipboard!');
          }
        </script>
      </body>
    </html>
  `);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start the server
// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to use the Todo Assistant`);
});