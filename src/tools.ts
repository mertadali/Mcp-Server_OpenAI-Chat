import { dbOperations } from "./database.js";

// Function to execute tool calls from OpenAI Assistant
// OpenAI Asistan'dan gelen araç çağrılarını yürüten fonksiyon
export async function executeToolCalls(toolCalls: any[]) {
  const results = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type === "function") {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      let result;
      
      // Çağrılan fonksiyona göre ilgili işleyiciyi çalıştır
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
      
      // Sonuçları OpenAI'ye dönecek formatta hazırla
      results.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify(result),
      });
    }
  }
  
  return results;
}

// Handler for add_todo function
// Yeni yapılacak iş ekleyen fonksiyon
async function handleAddTodo({ text }: { text: string }) {
  try {
    // Veritabanına yeni todo ekle
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
// Tüm yapılacak işleri getiren fonksiyon
async function handleGetTodos() {
  try {
    // Veritabanından tüm todoları getir
    const todos = dbOperations.getTodos();
    
    // Eğer hiç todo yoksa özel mesaj döndür
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
// ID'ye göre yapılacak işi silen fonksiyon
async function handleRemoveTodo({ id }: { id: number }) {
  try {
    // Önce ID'ye göre todo'yu bul
    const todo = dbOperations.getTodoById(id);
    
    // Todo bulunamazsa hata döndür
    if (!todo) {
      return {
        success: false,
        message: `Error: No To Do item found with ID ${id}`,
      };
    }
    
    // Todo'yu sil
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
// Yapılacak işin tamamlanma durumunu değiştiren fonksiyon
async function handleToggleTodo({ id }: { id: number }) {
  try {
    // Todo'nun tamamlanma durumunu değiştir
    const updatedTodo = dbOperations.toggleTodoCompleted(id);
    
    // Todo bulunamazsa hata döndür
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