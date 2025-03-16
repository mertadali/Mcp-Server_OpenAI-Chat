import { dbOperations } from "./database.js";

// Function to execute tool calls from OpenAI Assistant
export async function executeToolCalls(toolCalls: any[]) {
  const results = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type === "function") {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      let result;
      
      switch (functionName) {
        case "add_todo":
          result = await handleAddTodo(functionArgs);
          break;
        case "get_todos":
          result = await handleGetTodos();
          break;
        case "remove_todo":
          result = await handleRemoveTodo(functionArgs);
          break;
        case "toggle_todo":
          result = await handleToggleTodo(functionArgs);
          break;
        default:
          result = { error: `Unknown function: ${functionName}` };
      }
      
      results.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify(result),
      });
    }
  }
  
  return results;
}

// Handler for add_todo function
async function handleAddTodo({ text }: { text: string }) {
  try {
    const todo = dbOperations.addTodo(text);
    return {
      success: true,
      message: `"${text}" was successfully added to your To Do list with ID: ${todo.id}`,
      todo,
    };
  } catch (error) {
    console.error("Error adding todo:", error);
    return {
      success: false,
      message: "Failed to add todo item",
      error: String(error),
    };
  }
}

// Handler for get_todos function
async function handleGetTodos() {
  try {
    const todos = dbOperations.getTodos();
    
    if (todos.length === 0) {
      return {
        success: true,
        message: "You have no To Do items yet. Use add_todo to create one!",
        todos: [],
      };
    }

    return {
      success: true,
      message: `You have ${todos.length} To Do item(s)`,
      todos,
    };
  } catch (error) {
    console.error("Error getting todos:", error);
    return {
      success: false,
      message: "Failed to retrieve todo items",
      error: String(error),
    };
  }
}

// Handler for remove_todo function
async function handleRemoveTodo({ id }: { id: number }) {
  try {
    const todo = dbOperations.getTodoById(id);
    
    if (!todo) {
      return {
        success: false,
        message: `Error: No To Do item found with ID ${id}`,
      };
    }
    
    dbOperations.removeTodo(id);
    
    return {
      success: true,
      message: `To Do item "${todo.text}" (ID: ${id}) was successfully removed from your list`,
    };
  } catch (error) {
    console.error("Error removing todo:", error);
    return {
      success: false,
      message: "Failed to remove todo item",
      error: String(error),
    };
  }
}

// Handler for toggle_todo function
async function handleToggleTodo({ id }: { id: number }) {
  try {
    const updatedTodo = dbOperations.toggleTodoCompleted(id);
    
    if (!updatedTodo) {
      return {
        success: false,
        message: `Error: No To Do item found with ID ${id}`,
      };
    }
    
    const status = updatedTodo.completed ? "completed" : "incomplete";
    
    return {
      success: true,
      message: `To Do item "${updatedTodo.text}" (ID: ${id}) was marked as ${status}`,
      todo: updatedTodo,
    };
  } catch (error) {
    console.error("Error toggling todo:", error);
    return {
      success: false,
      message: "Failed to toggle todo item status",
      error: String(error),
    };
  }
}