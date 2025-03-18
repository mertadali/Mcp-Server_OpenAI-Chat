import { todoTools } from "./openai.js";

// OpenAI Assistant ile MCP arasında köprü kuran ara yüz
export interface OpenAIMCPBridge {
  userThreads: Map<string, string>;
  assistantId: string;
  executeToolCall: (toolCall: any) => Promise<any>;
}

export interface MCPRequest {
  version: string;
  messages: MCPMessage[];
  tools?: MCPTool[];
  metadata?: {
    conversation_id?: string;
    [key: string]: any;
  };
}

export interface MCPResponse {
  version: string;
  messages: MCPMessage[];
  metadata?: any;
}

export interface MCPMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | MCPMessageContent[];
  tool_call_id?: string;
  name?: string;
}

export interface MCPMessageContent {
  type: "text" | "tool_call" | "tool_result";
  text?: string;
  tool_call?: MCPToolCall;
  tool_result?: MCPToolResult;
}

export interface MCPToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface MCPToolResult {
  tool_call_id: string;
  content: string;
}

export interface MCPTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Convert OpenAI tools format to MCP tools format
export function convertToolsToMCPFormat(): MCPTool[] {
  return todoTools.map(tool => {
    return {
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }
    };
  });
}

// MCP standard error responses
export const MCPErrors = {
  INVALID_REQUEST: {
    error: {
      type: "invalid_request",
      message: "The request was malformed or invalid"
    }
  },
  AUTHENTICATION_ERROR: {
    error: {
      type: "authentication_error",
      message: "Authentication failed"
    }
  },
  PERMISSION_DENIED: {
    error: {
      type: "permission_denied",
      message: "The request requires higher privileges than provided"
    }
  },
  NOT_FOUND: {
    error: {
      type: "not_found",
      message: "The requested resource was not found"
    }
  },
  RATE_LIMIT_EXCEEDED: {
    error: {
      type: "rate_limit_exceeded",
      message: "Rate limit has been exceeded"
    }
  },
  INTERNAL_ERROR: {
    error: {
      type: "internal_error",
      message: "The server encountered an internal error"
    }
  }
};

// Constants for MCP
export const MCP_VERSION = "0.1"; 