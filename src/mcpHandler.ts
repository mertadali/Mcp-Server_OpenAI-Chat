import { MCPRequest, MCPResponse, MCPMessage, MCPMessageContent, MCPToolCall, MCP_VERSION, MCPErrors, OpenAIMCPBridge } from "./mcp.js";
import { executeToolCalls } from "./tools.js";
import crypto from "crypto";
import { openai } from "./openai.js";

// Store conversations by conversationId
const conversations = new Map<string, MCPMessage[]>();

// OpenAI bridge
let openAIBridge: OpenAIMCPBridge | null = null;

// Set the OpenAI bridge
export function setOpenAIBridge(bridge: OpenAIMCPBridge) {
  openAIBridge = bridge;
  console.log("OpenAI Bridge connected to MCP");
}

// Generate a unique ID for tool calls
const generateId = (): string => {
  return crypto.randomUUID();
};

// Process an MCP request
export async function processMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  try {
    console.log("MCP Request received:", JSON.stringify(request, null, 2));
    
    // Validate request
    if (!request.version || !request.messages || !Array.isArray(request.messages)) {
      console.log("Invalid MCP request format");
      return {
        version: MCP_VERSION,
        messages: [{
          role: "assistant",
          content: "Invalid request format. Please provide valid version and messages."
        }]
      };
    }

    // Get the conversation ID from metadata or create a new one
    const conversationId = request.metadata?.conversation_id || crypto.randomUUID();
    console.log(`MCP Processing for conversation: ${conversationId}`);
    
    // Get existing messages or initialize new conversation
    let conversationMessages = conversations.get(conversationId) || [];
    
    // Add new messages to the conversation
    conversationMessages = [...conversationMessages, ...request.messages];
    
    // Get the latest user message
    const latestUserMessage = request.messages.filter(msg => msg.role === "user").pop();
    
    // If OpenAI bridge is available and there's a user message, use OpenAI Assistant
    if (openAIBridge && latestUserMessage && typeof latestUserMessage.content === "string") {
      return await processWithOpenAI(conversationId, latestUserMessage.content, conversationMessages);
    }
    
    // Process any tool calls in the conversation with MCP
    const response = await processToolCalls(conversationMessages);
    console.log(`MCP Response:`, JSON.stringify(response, null, 2));
    
    // Update the conversation with the response
    conversations.set(conversationId, [...conversationMessages, ...response.messages]);
    
    // Return the response
    return {
      version: MCP_VERSION,
      messages: response.messages,
      metadata: {
        conversation_id: conversationId
      }
    };
  } catch (error) {
    console.error("Error processing MCP request:", error);
    return {
      version: MCP_VERSION,
      messages: [{
        role: "assistant",
        content: "An error occurred processing your request. Please try again."
      }],
      metadata: {
        error: (error instanceof Error) ? error.message : "Unknown error"
      }
    };
  }
}

// Process with OpenAI Assistant
async function processWithOpenAI(conversationId: string, userMessage: string, allMessages: MCPMessage[]): Promise<MCPResponse> {
  if (!openAIBridge) {
    return {
      version: MCP_VERSION,
      messages: [{
        role: "assistant",
        content: "OpenAI bridge is not available."
      }],
      metadata: { conversation_id: conversationId }
    };
  }
  
  try {
    console.log(`Processing MCP request with OpenAI for conversation: ${conversationId}`);
    // Get or create thread ID
    let threadId = openAIBridge.userThreads.get(conversationId);
    
    if (!threadId) {
      // Create a new thread
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      openAIBridge.userThreads.set(conversationId, threadId);
      console.log(`Created new OpenAI thread ${threadId} for MCP conversation ${conversationId}`);
      
      // Add previous system and user messages to maintain context
      for (const prevMsg of allMessages.filter(msg => msg.role === "system" || msg.role === "user")) {
        if (typeof prevMsg.content === "string") {
          await openai.beta.threads.messages.create(threadId, {
            role: prevMsg.role === "system" ? "user" : "user",
            content: prevMsg.content
          });
        }
      }
    } else {
      console.log(`Using existing OpenAI thread ${threadId} for MCP conversation ${conversationId}`);
      
      // Only add the latest user message
      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: userMessage
      });
    }
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: openAIBridge.assistantId
    });
    
    console.log(`Started OpenAI run ${run.id} for MCP conversation ${conversationId}`);
    
    // Poll for completion
    let runStatus = await pollRunStatus(threadId, run.id);
    console.log(`Run status: ${runStatus.status}`);
    
    // Handle tool calls if required
    if (runStatus.status === "requires_action" && 
        runStatus.required_action?.type === "submit_tool_outputs") {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      console.log(`Tool calls required (${toolCalls.length}):`);
      
      try {
        // Execute tools through MCP
        const toolOutputs = await executeToolCalls(toolCalls);
        console.log(`Tool outputs generated: ${toolOutputs.length}`);
        
        // Submit tool outputs
        await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
          tool_outputs: toolOutputs
        });
        
        // Continue polling until complete
        runStatus = await pollRunStatus(threadId, run.id);
        console.log(`Run status after tool execution: ${runStatus.status}`);
      } catch (toolError) {
        console.error("Error executing tools:", toolError);
        
        // Try to continue even if tool execution fails
        try {
          await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
            tool_outputs: toolCalls.map(tool => ({
              tool_call_id: tool.id,
              output: `Error executing tool: ${toolError instanceof Error ? toolError.message : "Unknown error"}`
            }))
          });
          
          runStatus = await pollRunStatus(threadId, run.id);
        } catch (submitError) {
          console.error("Error submitting tool outputs:", submitError);
        }
      }
    }
    
    // Get assistant messages
    const messages = await openai.beta.threads.messages.list(threadId);
    
    // Find the most recent assistant message
    const assistantMessages = messages.data
      .filter(msg => msg.role === "assistant")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    if (assistantMessages.length === 0) {
      throw new Error("No assistant response found");
    }
    
    // Format the response for MCP
    const latestMessage = assistantMessages[0];
    
    // Create MCP format message
    let mcpAssistantMessage: MCPMessage;
    
    // Check if the message contains tool calls
    const toolCalls = latestMessage.content
      .filter(item => item.type === "tool_call" as any)
      .map(item => (item as any).tool_call);
    
    if (toolCalls.length > 0) {
      // Create content array with text and tool calls
      const mcpContent: MCPMessageContent[] = [];
      
      // Add any text content
      const textContents = latestMessage.content
        .filter(item => item.type === "text")
        .map(item => item.text.value);
        
      if (textContents.length > 0) {
        mcpContent.push({
          type: "text",
          text: textContents.join("\n")
        });
      }
      
      // Add tool calls
      for (const toolCall of toolCalls) {
        mcpContent.push({
          type: "tool_call",
          tool_call: {
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments
            }
          }
        });
      }
      
      mcpAssistantMessage = {
        role: "assistant",
        content: mcpContent
      };
    } else {
      // Standard text response
      const content = latestMessage.content.map(item => {
        if (item.type === "text") {
          return item.text.value;
        }
        return "";
      }).join("");
      
      mcpAssistantMessage = {
        role: "assistant",
        content: content
      };
    }
    
    // Update the conversation with the response
    conversations.set(conversationId, [...allMessages, mcpAssistantMessage]);
    
    return {
      version: MCP_VERSION,
      messages: [mcpAssistantMessage],
      metadata: { conversation_id: conversationId }
    };
  } catch (error) {
    console.error("Error processing with OpenAI:", error);
    return {
      version: MCP_VERSION,
      messages: [{
        role: "assistant",
        content: "Error processing your request with OpenAI. Please try again."
      }],
      metadata: { 
        conversation_id: conversationId,
        error: (error instanceof Error) ? error.message : "Unknown error"
      }
    };
  }
}

// Poll for run status
async function pollRunStatus(threadId: string, runId: string) {
  let runStatus;
  
  while (true) {
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    if (
      runStatus.status === "completed" ||
      runStatus.status === "failed" ||
      runStatus.status === "requires_action" ||
      runStatus.status === "cancelled"
    ) {
      break;
    }
    
    // Wait for 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return runStatus;
}

// Process tool calls in the conversation
async function processToolCalls(messages: MCPMessage[]): Promise<MCPResponse> {
  // Find tool calls in the most recent assistant message
  const assistantMessages = messages.filter(msg => msg.role === "assistant");
  
  if (assistantMessages.length === 0) {
    return {
      version: MCP_VERSION,
      messages: []
    };
  }
  
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
  
  // If the content is a string, there are no tool calls
  if (typeof latestAssistantMessage.content === "string") {
    return {
      version: MCP_VERSION,
      messages: []
    };
  }
  
  // Find tool call content items
  const toolCallItems = (latestAssistantMessage.content as MCPMessageContent[])
    .filter(item => item.type === "tool_call" && item.tool_call);
  
  if (toolCallItems.length === 0) {
    return {
      version: MCP_VERSION,
      messages: []
    };
  }
  
  // Extract all tool calls
  const toolCalls = toolCallItems.map(item => item.tool_call!);
  
  // Convert from MCP format to OpenAI format for tool execution
  const openaiToolCalls = toolCalls.map(toolCall => ({
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments
    }
  }));
  
  try {
    // Execute the tool calls
    const results = await executeToolCalls(openaiToolCalls);
    
    // Convert results to MCP format
    const toolResultMessages: MCPMessage[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const toolCall = toolCalls[i];
      
      if (!toolCall) {
        toolResultMessages.push({
          role: "tool",
          content: "Error: Tool call not found"
        });
        continue;
      }
      
      let resultContent = '';
      if (result.output) {
        resultContent = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
      } else {
        resultContent = JSON.stringify(result);
      }
      
      toolResultMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: resultContent
      });
    }
    
    return {
      version: MCP_VERSION,
      messages: toolResultMessages
    };
  } catch (error) {
    console.error("Error executing tool calls:", error);
    
    // Return error messages for each tool call
    const errorMessages: MCPMessage[] = toolCalls.map(toolCall => ({
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: `Error executing tool: ${error instanceof Error ? error.message : "Unknown error"}`
    }));
    
    return {
      version: MCP_VERSION,
      messages: errorMessages
    };
  }
}

// Create a tool call message
export function createToolCallMessage(functionName: string, functionArgs: any): MCPMessage {
  const toolCallId = generateId();
  
  return {
    role: "assistant",
    content: [
      {
        type: "tool_call",
        tool_call: {
          id: toolCallId,
          type: "function",
          function: {
            name: functionName,
            arguments: JSON.stringify(functionArgs)
          }
        }
      }
    ]
  };
} 