import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import open from 'open';

// Takvim entegrasyonu için gerekli yapılandırma
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = join(homedir(), 'openai-todos', 'google-token.json');
const CREDENTIALS_PATH = join(homedir(), 'openai-todos', 'google-credentials.json');

// OAuth2 istemcisi
let oAuth2Client: OAuth2Client | null = null;

// Google Calendar API'si
let calendar: any = null;

// Kimlik doğrulama durumu
let isAuthenticated = false;

/**
 * Google Calendar API'sine bağlanmak için kimlik doğrulama işlemi
 */
export async function authenticateGoogleCalendar(credentials: any): Promise<boolean> {
  try {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Daha önce kaydedilmiş token var mı kontrol et
    if (existsSync(TOKEN_PATH)) {
      try {
        const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);
        
        // Token'ın geçerliliğini kontrol et
        try {
          // Test API çağrısı yap
          calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
          await calendar.calendarList.list({ maxResults: 1 });
          isAuthenticated = true;
          console.log('Mevcut Google Calendar token geçerli.');
          return true;
        } catch (apiError) {
          console.log('Mevcut token geçersiz, yenilemeye çalışılıyor...');
          
          // Token yenileme denemesi
          if (token.refresh_token) {
            try {
              // @ts-ignore - refreshToken metodu protected olarak işaretlenmiş olabilir
              const { tokens } = await oAuth2Client.refreshToken(token.refresh_token);
              oAuth2Client.setCredentials(tokens);
              
              // Yeni token'ı kaydet (refresh_token'ı koru)
              const newTokens = {
                ...tokens,
                refresh_token: token.refresh_token || tokens.refresh_token
              };
              
              // Token dizininin varlığını kontrol et
              const tokenDir = dirname(TOKEN_PATH);
              if (!existsSync(tokenDir)) {
                mkdirSync(tokenDir, { recursive: true });
              }
              
              writeFileSync(TOKEN_PATH, JSON.stringify(newTokens));
              
              calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
              isAuthenticated = true;
              console.log('Google Calendar token başarıyla yenilendi.');
              return true;
            } catch (refreshError) {
              console.error('Token yenileme hatası:', refreshError);
            }
          }
        }
      } catch (tokenError) {
        console.error('Token okuma hatası:', tokenError);
      }
    }

    // Yeni token al
    return await getNewToken();
  } catch (error) {
    console.error('Google Calendar kimlik doğrulama hatası:', error);
    return false;
  }
}

/**
 * Yeni bir token almak için kullanıcıyı yönlendir
 */
async function getNewToken(): Promise<boolean> {
  if (!oAuth2Client) return false;

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // Force consent screen to appear every time
    prompt: 'consent'
  });

  console.log('Google Calendar\'a erişim için şu URL\'yi ziyaret edin:');
  console.log(authUrl);

  // Tarayıcıda URL'yi aç
  await open(authUrl);
  
  return false;
}

/**
 * Kullanıcının girdiği kodu kullanarak token al
 */
export async function getTokenFromCode(code: string): Promise<boolean> {
  if (!oAuth2Client) return false;

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Token'ı daha sonra kullanmak üzere kaydet
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    isAuthenticated = true;
    return true;
  } catch (error) {
    console.error('Token alma hatası:', error);
    return false;
  }
}

/**
 * Google Calendar'a etkinlik ekle
 */
export async function addEventToGoogleCalendar(
  summary: string,
  description: string,
  date: string,
  time: string,
  durationMinutes: number = 60
): Promise<any> {
  if (!isAuthenticated || !calendar) {
    return {
      success: false,
      message: 'Google Calendar\'a bağlı değilsiniz. Önce kimlik doğrulaması yapın.',
    };
  }

  try {
    // Tarih ve saat formatını düzenle
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    
    const startDateTime = new Date(year, month - 1, day, hour, minute);
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

    const event = {
      summary,
      description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: {
        useDefault: true,
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return {
      success: true,
      message: 'Etkinlik Google Calendar\'a başarıyla eklendi.',
      event: response.data,
    };
  } catch (error) {
    console.error('Google Calendar etkinlik ekleme hatası:', error);
    return {
      success: false,
      message: 'Etkinlik eklenirken bir hata oluştu.',
      error: String(error),
    };
  }
}

/**
 * Google Calendar'dan etkinlikleri getir
 */
export async function getEventsFromGoogleCalendar(date?: string): Promise<any> {
  if (!isAuthenticated || !calendar) {
    return {
      success: false,
      message: 'Google Calendar\'a bağlı değilsiniz. Önce kimlik doğrulaması yapın.',
    };
  }

  try {
    let timeMin, timeMax;

    if (date) {
      // Belirli bir tarih için etkinlikleri getir
      const [year, month, day] = date.split('-').map(Number);
      timeMin = new Date(year, month - 1, day, 0, 0, 0).toISOString();
      timeMax = new Date(year, month - 1, day, 23, 59, 59).toISOString();
    } else {
      // Bugünden itibaren gelecek etkinlikleri getir
      timeMin = new Date().toISOString();
      // Bir ay sonrasına kadar olan etkinlikleri getir
      const oneMonthLater = new Date();
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      timeMax = oneMonthLater.toISOString();
    }

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;

    if (!events || events.length === 0) {
      return {
        success: true,
        message: date 
          ? `Belirtilen tarih için etkinlik bulunamadı: ${date}` 
          : 'Gelecek etkinlik bulunamadı.',
        events: [],
      };
    }

    return {
      success: true,
      message: `${events.length} etkinlik bulundu.`,
      events,
    };
  } catch (error) {
    console.error('Google Calendar etkinlik getirme hatası:', error);
    return {
      success: false,
      message: 'Etkinlikler getirilirken bir hata oluştu.',
      error: String(error),
    };
  }
}

/**
 * Kimlik bilgilerini kontrol et ve gerekirse kimlik doğrulaması yap
 */


/**
 * Kimlik bilgilerini kaydet
 */
export function saveCredentials(credentials: string): boolean {
  try {
    writeFileSync(CREDENTIALS_PATH, credentials);
    return true;
  } catch (error) {
    console.error('Kimlik bilgileri kaydedilirken hata oluştu:', error);
    return false;
  }
}

/**
 * Kimlik doğrulama durumunu kontrol et
 */
export function isCalendarAuthenticated(): boolean {
  return isAuthenticated;
}

export async function initializeGoogleCalendar(): Promise<boolean> {
  try {
    // Use environment variables instead of credentials file
    const client_id = process.env.CLIENT_ID;
    const client_secret = process.env.CLIENT_SECRET;
    const redirect_uri = process.env.GOOGLE_REDIRECT_URI;
    
    if (!client_id || !client_secret || !redirect_uri) {
      console.error('Missing Google Calendar credentials in .env file');
      return false;
    }
    
    // Create credentials object
    const credentials = {
      installed: {
        client_id,
        client_secret,
        redirect_uris: [redirect_uri]
      }
    };
    
    return await authenticateGoogleCalendar(credentials);
  } catch (error) {
    console.error('Google Calendar initialization error:', error);
    return false;
  }
} 