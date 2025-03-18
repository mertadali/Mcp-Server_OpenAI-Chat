#!/usr/bin/env node

/**
 * Simple MCP client for testing the MCP implementation
 * 
 * Usage:
 *   node mcp-client.js "Your message here"
 */

import fetch from 'node-fetch';
import readline from 'readline';

const MCP_SERVER_URL = 'http://localhost:3000/mcp';
const MCP_VERSION = '0.1';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Store conversation for context
const conversation = {
  messages: [],
  conversationId: null
};

// Main function
async function main() {
  console.log('MCP Client - Todo Assistant');
  console.log('---------------------------');
  console.log('Type "exit" to quit or "clear" to clear the conversation.');
  console.log('This client now uses OpenAI Assistant through MCP protocol!');
  console.log();

  // Check server health
  try {
    const health = await fetch('http://localhost:3000/mcp/health');
    const healthData = await health.json();
    console.log(`Server status: ${healthData.status}`);
    console.log(`MCP version: ${healthData.version}`);
    console.log();
  } catch (error) {
    console.error('Error connecting to MCP server:', error.message);
    console.error('Make sure the server is running with MCP enabled (npm run dev:mcp)');
    process.exit(1);
  }

  // Process command line argument as first message
  const initialMessage = process.argv[2];
  if (initialMessage) {
    await sendMessage(initialMessage);
  }

  // Start the interactive prompt
  promptUser();
}

// Prompt for user input
function promptUser() {
  rl.question('> ', async (message) => {
    if (message.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }
    
    if (message.toLowerCase() === 'clear') {
      conversation.messages = [];
      conversation.conversationId = null;
      console.log('Conversation cleared!');
      promptUser();
      return;
    }

    await sendMessage(message);
    promptUser();
  });
}

// Send message to MCP server
async function sendMessage(message) {
  try {
    // Add user message to conversation
    conversation.messages.push({
      role: 'user',
      content: message
    });

    // Prepare request
    const request = {
      version: MCP_VERSION,
      messages: conversation.messages
    };

    // Add conversation ID if available
    if (conversation.conversationId) {
      request.metadata = {
        conversation_id: conversation.conversationId
      };
    }

    // Send request to MCP server
    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    // Process response
    const data = await response.json();

    // Check for error
    if (data.error) {
      console.error('Error:', data.error.message);
      return;
    }

    // Save conversation ID
    if (data.metadata && data.metadata.conversation_id) {
      conversation.conversationId = data.metadata.conversation_id;
    }

    // Process messages
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        if (msg.role === 'assistant') {
          const content = typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content);
          console.log('\nAssistant:', content);
          conversation.messages.push(msg);
        } else if (msg.role === 'tool') {
          console.log(`\nTool (${msg.name || 'unknown'}):`);
          console.log(msg.content);
          conversation.messages.push(msg);
        }
      }
      console.log();
    } else {
      console.log('\nNo response from assistant\n');
    }
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

// Start the client
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 