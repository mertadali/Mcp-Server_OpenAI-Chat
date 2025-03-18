import { dbOperations } from "./database.js";
import { 
  initializeGoogleCalendar, 
  saveCredentials, 
  getTokenFromCode, 
  addEventToGoogleCalendar, 
  getEventsFromGoogleCalendar, 
  isCalendarAuthenticated 
} from "./calendar.js";
import { join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";

// Uygulama başladığında Google Calendar'ı başlat
initializeGoogleCalendar().then(success => {
  if (success) {
    console.log('Google Calendar başarıyla başlatıldı.');
  } else {
    console.log('Google Calendar başlatılamadı. Kimlik doğrulaması gerekiyor.');
  }
});

// Function to execute tool calls from OpenAI Assistant or MCP
// OpenAI Asistan'dan gelen veya MCP'den gelen araç çağrılarını yürüten fonksiyon
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
        case "remove_all_todos":
          result = await handleRemoveAllTodos();
          break;
        case "toggle_todo":
          result = await handleToggleTodo(functionArgs);
          break;
        case "add_todo_to_calendar":
          result = await handleAddTodoToCalendar(functionArgs);
          break;
        case "get_calendar_events":
          result = await handleGetCalendarEvents(functionArgs);
          break;
        case "add_todo_to_google_calendar":
          result = await handleAddTodoToGoogleCalendar(functionArgs);
          break;
        case "get_google_calendar_events":
          result = await handleGetGoogleCalendarEvents(functionArgs);
          break;
        case "setup_google_calendar":
          result = await handleSetupGoogleCalendar(functionArgs);
          break;
        case "authenticate_google_calendar":
          result = await handleAuthenticateGoogleCalendar(functionArgs);
          break;
        case "check_google_calendar_auth":
          result = await handleCheckGoogleCalendarAuth();
          break;
        case "add_event_to_google_calendar":
          result = await handleAddEventToGoogleCalendar(functionArgs);
          break;
        default:
          result = {
            error: `Unknown function: ${functionName}`
          };
      }
      
      // Format the result for OpenAI format (for backward compatibility)
      results.push({
        tool_call_id: toolCall.id,
        output: typeof result === 'string' ? result : JSON.stringify(result)
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

// Handler for remove_all_todos function
// Tüm yapılacak işleri silen fonksiyon
async function handleRemoveAllTodos() {
  try {
    // Önce mevcut todo sayısını kontrol et
    const todos = dbOperations.getTodos();
    
    if (todos.length === 0) {
      return {
        success: true,
        message: "You have no To Do items to remove.",
      };
    }
    
    // Tüm todoları sil
    const removedCount = dbOperations.removeAllTodos();
    
    return {
      success: true,
      message: `Successfully removed all ${removedCount} To Do items from your list.`,
      removedCount,
    };
  } catch (error) {
    console.error("Error removing all todos:", error);
    return {
      success: false,
      message: "Failed to remove all todo items",
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

// Handler for add_todo_to_calendar function
// Todo'yu takvime ekleyen fonksiyon
async function handleAddTodoToCalendar({ todoId, date, time }: { todoId: number, date: string, time: string }) {
  try {
    // Validate date format (YYYY-MM-DD)
    // Tarih formatını doğrula (DD-MM-YYYY)
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      return {
        success: false,
        message: "Invalid date format. Please use DD-MM-YYYY format.",
      };
    }
    
    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return {
        success: false,
        message: "Invalid time format. Please use HH:MM format (24-hour).",
      };
    }
    
    // Todo'yu takvime ekle
    const calendarEvent = dbOperations.addTodoToCalendar(todoId, date, time);
    
    // Todo bulunamazsa hata döndür
    if (!calendarEvent) {
      return {
        success: false,
        message: `Error: No To Do item found with ID ${todoId}`,
      };
    }
    
    // Format date for display
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return {
      success: true,
      message: `To Do item "${calendarEvent.title}" was successfully added to your calendar for ${formattedDate} at ${time}`,
      calendarEvent,
    };
  } catch (error) {
    console.error("Error adding todo to calendar:", error);
    return {
      success: false,
      message: "Failed to add todo to calendar",
      error: String(error),
    };
  }
}

// Handler for get_calendar_events function
// Takvim etkinliklerini getiren fonksiyon
async function handleGetCalendarEvents({ date }: { date?: string }) {
  try {
    let calendarEvents;
    
    // If date is provided, get events for that date
    if (date) {
      // Validate date format (YYYY-MM-DD)
      // Tarih formatını doğrula (DD-MM-YYYY)
      if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        return {
          success: false,
          message: "Invalid date format. Please use DD-MM-YYYY format.",
        };
      }
      
      calendarEvents = dbOperations.getCalendarEventsByDate(date);
      
      // Format date for display
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (calendarEvents.length === 0) {
        return {
          success: true,
          message: `You have no calendar events scheduled for ${formattedDate}`,
          calendarEvents: [],
        };
      }
      
      return {
        success: true,
        message: `You have ${calendarEvents.length} event(s) scheduled for ${formattedDate}`,
        calendarEvents,
      };
    } else {
      // Get all calendar events
      calendarEvents = dbOperations.getCalendarEvents();
      
      if (calendarEvents.length === 0) {
        return {
          success: true,
          message: "You have no calendar events scheduled",
          calendarEvents: [],
        };
      }
      
      return {
        success: true,
        message: `You have ${calendarEvents.length} calendar event(s) scheduled`,
        calendarEvents,
      };
    }
  } catch (error) {
    console.error("Error getting calendar events:", error);
    return {
      success: false,
      message: "Failed to retrieve calendar events",
      error: String(error),
    };
  }
}

// Handler for add_todo_to_google_calendar function
// Todo'yu Google Calendar'a ekleyen fonksiyon
async function handleAddTodoToGoogleCalendar({ 
  todoId, 
  date, 
  time, 
  durationMinutes = 60 
}: { 
  todoId: number, 
  date: string, 
  time: string, 
  durationMinutes?: number 
}) {
  try {
    // Önce Google Calendar kimlik doğrulamasını kontrol et
    if (!isCalendarAuthenticated()) {
      return {
        success: false,
        message: "Google Calendar'a bağlı değilsiniz. Önce 'setup_google_calendar' ve 'authenticate_google_calendar' fonksiyonlarını kullanarak kimlik doğrulaması yapın.",
      };
    }
    
    // Validate date format (YYYY-MM-DD)
    // Tarih formatını doğrula (DD-MM-YYYY)
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      return {
        success: false,
        message: "Invalid date format. Please use DD-MM-YYYY format.",
      };
    }
    
    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return {
        success: false,
        message: "Invalid time format. Please use HH:MM format (24-hour).",
      };
    }
    
    // Todo'yu bul
    const todo = dbOperations.getTodoById(todoId);
    
    // Todo bulunamazsa hata döndür
    if (!todo) {
      return {
        success: false,
        message: `Error: No To Do item found with ID ${todoId}`,
      };
    }
    
    // Google Calendar'a ekle
    const result = await addEventToGoogleCalendar(
      todo.text, // Başlık olarak todo metni
      `Todo ID: ${todo.id}`, // Açıklama olarak todo ID'si
      date,
      time,
      durationMinutes
    );
    
    if (!result.success) {
      return result;
    }
    
    // Ayrıca yerel takvime de ekle
    const calendarEvent = dbOperations.addTodoToCalendar(todoId, date, time);
    
    // Format date for display
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return {
      success: true,
      message: `To Do item "${todo.text}" was successfully added to your Google Calendar for ${formattedDate} at ${time}`,
      googleEvent: result.event,
      localEvent: calendarEvent,
    };
  } catch (error) {
    console.error("Error adding todo to Google Calendar:", error);
    return {
      success: false,
      message: "Failed to add todo to Google Calendar",
      error: String(error),
    };
  }
}

// Handler for get_google_calendar_events function
// Google Calendar'dan etkinlikleri getiren fonksiyon
async function handleGetGoogleCalendarEvents({ date }: { date?: string }) {
  try {
    // Önce Google Calendar kimlik doğrulamasını kontrol et
    if (!isCalendarAuthenticated()) {
      return {
        success: false,
        message: "Google Calendar'a bağlı değilsiniz. Önce 'setup_google_calendar' ve 'authenticate_google_calendar' fonksiyonlarını kullanarak kimlik doğrulaması yapın.",
      };
    }
    
    // Validate date format if provided
    // Tarih formatını doğrula (DD-MM-YYYY)
    if (date && !/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      return {
        success: false,
        message: "Invalid date format. Please use DD-MM-YYYY format.",
      };
    }
    
    // Google Calendar'dan etkinlikleri getir
    const result = await getEventsFromGoogleCalendar(date);
    
    return result;
  } catch (error) {
    console.error("Error getting Google Calendar events:", error);
    return {
      success: false,
      message: "Failed to retrieve Google Calendar events",
      error: String(error),
    };
  }
}

// Handler for setup_google_calendar function
// Google Calendar kurulumunu yapan fonksiyon
async function handleSetupGoogleCalendar({ credentials }: { credentials: string }) {
  try {
    // Artık .env dosyasından kimlik bilgilerini kullanıyoruz
    console.log('Google Calendar kimlik bilgileri .env dosyasından okunuyor.');
    
    // Google Calendar'ı başlat
    const initialized = await initializeGoogleCalendar();
    
    if (initialized) {
      return {
        success: true,
        message: "Google Calendar başarıyla kuruldu ve kimlik doğrulaması yapıldı.",
      };
    } else {
      // Kullanıcıya daha açıklayıcı talimatlar ver
      return {
        success: true,
        message: "Google Calendar kimlik doğrulaması için bir tarayıcı penceresi açıldı. Lütfen Google hesabınızla giriş yapın ve izin verin. Sonra size verilen kodu kopyalayıp buraya yapıştırın. Ardından 'authenticate_google_calendar' komutunu kullanarak şu şekilde kimlik doğrulamasını tamamlayın: 'Google Calendar'ı şu kodla doğrula: [BURAYA_KODU_YAPIŞTIRIN]'",
        needsAuthentication: true,
      };
    }
  } catch (error) {
    console.error("Error setting up Google Calendar:", error);
    return {
      success: false,
      message: "Google Calendar kurulumu sırasında bir hata oluştu. Lütfen .env dosyasındaki CLIENT_ID, CLIENT_SECRET ve GOOGLE_REDIRECT_URI değerlerinin doğru olduğundan emin olun.",
      error: String(error),
    };
  }
}

// Handler for authenticate_google_calendar function
// Google Calendar kimlik doğrulamasını tamamlayan fonksiyon
async function handleAuthenticateGoogleCalendar({ code }: { code: string }) {
  try {
    const authenticated = await getTokenFromCode(code);
    
    if (authenticated) {
      return {
        success: true,
        message: "Google Calendar kimlik doğrulaması başarıyla tamamlandı.",
      };
    } else {
      return {
        success: false,
        message: "Google Calendar kimlik doğrulaması başarısız oldu. Lütfen geçerli bir kod girin.",
      };
    }
  } catch (error) {
    console.error("Error authenticating Google Calendar:", error);
    return {
      success: false,
      message: "Google Calendar kimlik doğrulaması sırasında bir hata oluştu.",
      error: String(error),
    };
  }
}

// Handler for check_google_calendar_auth function
// Google Calendar kimlik doğrulama durumunu kontrol eden fonksiyon
async function handleCheckGoogleCalendarAuth() {
  const authenticated = isCalendarAuthenticated();
  
  if (authenticated) {
    return {
      success: true,
      message: "Google Calendar kimlik doğrulaması yapılmış durumda. Doğrudan Google Takvim'e etkinlik ekleyebilirsiniz.",
      authenticated: true,
    };
  } else {
    // Token dosyasının varlığını kontrol et
    const tokenPath = join(homedir(), 'openai-todos', 'google-token.json');
    const tokenExists = existsSync(tokenPath);
    
    if (tokenExists) {
      return {
        success: true,
        message: "Google Calendar token dosyası mevcut ancak geçerli değil. Token'ı yenilemek için 'setup_google_calendar' komutunu kullanın.",
        authenticated: false,
        tokenExists: true
      };
    } else {
      return {
        success: true,
        message: "Google Calendar kimlik doğrulaması yapılmamış. Lütfen 'setup_google_calendar' ve 'authenticate_google_calendar' fonksiyonlarını kullanarak kimlik doğrulamasını tamamlayın.",
        authenticated: false,
        tokenExists: false
      };
    }
  }
}

// Handler for add_event_to_google_calendar function
// Google Calendar'a etkinlik ekleyen fonksiyon
async function handleAddEventToGoogleCalendar({ title, description, date, time }: { title: string, description: string, date: string, time: string }) {
  try {
    // Önce Google Calendar kimlik doğrulamasını kontrol et
    if (!isCalendarAuthenticated()) {
      return {
        success: false,
        message: "Google Calendar'a bağlı değilsiniz. Önce 'setup_google_calendar' ve 'authenticate_google_calendar' fonksiyonlarını kullanarak kimlik doğrulaması yapın.",
      };
    }
    
    // Validate date format (YYYY-MM-DD)
    // Tarih formatını doğrula (DD-MM-YYYY)
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      return {
        success: false,
        message: "Invalid date format. Please use DD-MM-YYYY format.",
      };
    }
    
    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return {
        success: false,
        message: "Invalid time format. Please use HH:MM format (24-hour).",
      };
    }
    
    // Google Calendar'a ekle
    const result = await addEventToGoogleCalendar(
      title,
      description,
      date,
      time
    );
    
    if (!result.success) {
      return result;
    }
    
    return {
      success: true,
      message: `Event "${title}" was successfully added to your Google Calendar for ${date} at ${time}`,
      googleEvent: result.event,
    };
  } catch (error) {
    console.error("Error adding event to Google Calendar:", error);
    return {
      success: false,
      message: "Failed to add event to Google Calendar",
      error: String(error),
    };
  }
}