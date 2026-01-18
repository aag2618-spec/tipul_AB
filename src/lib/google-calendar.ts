import { google, calendar_v3 } from 'googleapis';
import prisma from './prisma';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
);

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: { email: string; name?: string }[];
}

/**
 * Get Google Calendar client for a user
 */
export async function getCalendarClient(userId: string) {
  // Get user's account with Google tokens
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  });

  if (!account?.access_token) {
    throw new Error('משתמש לא מחובר ל-Google');
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || account.refresh_token,
        },
      });
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Add session to Google Calendar
 */
export async function addToGoogleCalendar(
  userId: string,
  event: CalendarEvent
): Promise<string | null> {
  try {
    const calendar = await getCalendarClient(userId);

    const calendarEvent: calendar_v3.Schema$Event = {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: 'Asia/Jerusalem',
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: 'Asia/Jerusalem',
      },
      location: event.location,
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.name,
      })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 24 hours before
          { method: 'popup', minutes: 60 }, // 1 hour before
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: calendarEvent,
      sendUpdates: 'all', // Send invites to attendees
    });

    return response.data.id || null;
  } catch (error) {
    console.error('Error adding to Google Calendar:', error);
    return null;
  }
}

/**
 * Update event in Google Calendar
 */
export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<boolean> {
  try {
    const calendar = await getCalendarClient(userId);

    const updateData: calendar_v3.Schema$Event = {};
    
    if (event.summary) updateData.summary = event.summary;
    if (event.description) updateData.description = event.description;
    if (event.location) updateData.location = event.location;
    if (event.startTime) {
      updateData.start = {
        dateTime: event.startTime.toISOString(),
        timeZone: 'Asia/Jerusalem',
      };
    }
    if (event.endTime) {
      updateData.end = {
        dateTime: event.endTime.toISOString(),
        timeZone: 'Asia/Jerusalem',
      };
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: updateData,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Error updating Google Calendar event:', error);
    return false;
  }
}

/**
 * Delete event from Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  try {
    const calendar = await getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
    return false;
  }
}

/**
 * Check if user has Google Calendar connected
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  });

  return !!account?.access_token;
}

/**
 * Get user's upcoming events from Google Calendar
 */
export async function getUpcomingGoogleEvents(
  userId: string,
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(userId);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((event) => ({
      id: event.id || undefined,
      summary: event.summary || '',
      description: event.description || undefined,
      startTime: new Date(event.start?.dateTime || event.start?.date || ''),
      endTime: new Date(event.end?.dateTime || event.end?.date || ''),
      location: event.location || undefined,
    }));
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error);
    return [];
  }
}
