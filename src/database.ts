import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface CalendarEvent {
  id: number;
  todoId: number;
  title: string;
  date: string;
  time: string;
  createdAt: string;
}

// Veritabanı dosyasının konumunu belirle
const DB_LOCATION = join(homedir(), "openai-todos");
const dataDir = resolve(DB_LOCATION);

// Create data directory if it doesn't exist
// Veri dizini yoksa oluştur
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Initialize database
// Veritabanını başlat
const dbPath = join(dataDir, "todos.db");
const db = new Database(dbPath);

// Create todos table if it doesn't exist
// Todos tablosu yoksa oluştur
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  )
`);

// Create calendar events table if it doesn't exist
// Takvim etkinlikleri tablosu yoksa oluştur
db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todoId INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (todoId) REFERENCES todos(id) ON DELETE CASCADE
  )
`);

// Database operations
// Veritabanı işlemleri
export const dbOperations = {
  // Add a new todo
  // Yeni bir todo ekle
  addTodo: (text: string): Todo => {
    const createdAt = new Date().toISOString();
    const stmt = db.prepare(
      "INSERT INTO todos (text, completed, createdAt) VALUES (?, 0, ?)"
    );
    const info = stmt.run(text, createdAt);

    return {
      id: info.lastInsertRowid as number,
      text,
      completed: false,
      createdAt,
    };
  },

  // Get all todos
  // Tüm todoları getir
  getTodos: (): Todo[] => {
    const stmt = db.prepare("SELECT * FROM todos ORDER BY id DESC");
    return stmt.all() as Todo[];
  },

  // Remove a todo by id
  // ID'ye göre todo sil
  removeTodo: (id: number): boolean => {
    const stmt = db.prepare("DELETE FROM todos WHERE id = ?");
    const info = stmt.run(id);
    return info.changes > 0;
  },
  
  // Remove all todos
  // Tüm todoları sil
  removeAllTodos: (): number => {
    // Önce ilişkili tüm takvim etkinliklerini sil
    const deleteCalendarStmt = db.prepare("DELETE FROM calendar_events");
    deleteCalendarStmt.run();
    
    // Sonra tüm todoları sil
    const deleteTodosStmt = db.prepare("DELETE FROM todos");
    const info = deleteTodosStmt.run();
    
    // Silinen todo sayısını döndür
    return info.changes;
  },

  // Get a todo by id
  // ID'ye göre todo getir
  getTodoById: (id: number): Todo | undefined => {
    const stmt = db.prepare("SELECT * FROM todos WHERE id = ?");
    return stmt.get(id) as Todo | undefined;
  },

  // Update a todo's completion status
  // Todo'nun tamamlanma durumunu güncelle
  toggleTodoCompleted: (id: number): Todo | undefined => {
    const todo = dbOperations.getTodoById(id);
    if (!todo) return undefined;
    
    const newStatus = todo.completed ? 0 : 1;
    const stmt = db.prepare("UPDATE todos SET completed = ? WHERE id = ?");
    stmt.run(newStatus, id);
    
    return dbOperations.getTodoById(id);
  },

  // Add a todo to calendar
  // Todo'yu takvime ekle
  addTodoToCalendar: (todoId: number, date: string, time: string): CalendarEvent | undefined => {
    const todo = dbOperations.getTodoById(todoId);
    if (!todo) return undefined;
    
    const createdAt = new Date().toISOString();
    const stmt = db.prepare(
      "INSERT INTO calendar_events (todoId, title, date, time, createdAt) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(todoId, todo.text, date, time, createdAt);
    
    return {
      id: info.lastInsertRowid as number,
      todoId,
      title: todo.text,
      date,
      time,
      createdAt
    };
  },
  
  // Get calendar events
  // Takvim etkinliklerini getir
  getCalendarEvents: (): CalendarEvent[] => {
    const stmt = db.prepare("SELECT * FROM calendar_events ORDER BY date ASC, time ASC");
    return stmt.all() as CalendarEvent[];
  },
  
  // Get calendar events for a specific date
  // Belirli bir tarih için takvim etkinliklerini getir
  getCalendarEventsByDate: (date: string): CalendarEvent[] => {
    const stmt = db.prepare("SELECT * FROM calendar_events WHERE date = ? ORDER BY time ASC");
    return stmt.all(date) as CalendarEvent[];
  },
  
  // Get calendar events for a specific todo
  // Belirli bir todo için takvim etkinliklerini getir
  getCalendarEventsByTodoId: (todoId: number): CalendarEvent[] => {
    const stmt = db.prepare("SELECT * FROM calendar_events WHERE todoId = ?");
    return stmt.all(todoId) as CalendarEvent[];
  }
};