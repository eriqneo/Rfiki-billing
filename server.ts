import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// CORS for PocketHost deployment
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-google-tokens");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
);

// Google Auth 
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                tokens: ${JSON.stringify(tokens)} 
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. Returning to Rafiki...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

// Google Calendar Endpoints
app.get("/api/google-calendar/meetings", async (req, res) => {
  const tokens = req.headers['x-google-tokens'] as string;
  if (!tokens) {
    return res.status(401).json({ error: "Authentication status: DISCONNECTED (Missing Header)" });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
    );
    
    let parsedTokens;
    try {
      parsedTokens = JSON.parse(tokens);
    } catch (e) {
      console.error("[RAFIKI] Malformed token header (Fetch):", tokens);
      return res.status(401).json({ error: "Corrupted Auth Token" });
    }
    
    client.setCredentials(parsedTokens);
    
    let refreshedTokens: any = null;
    client.on('tokens', (t) => {
      refreshedTokens = t;
    });

    const calendar = google.calendar({ version: "v3", auth: client });

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    if (refreshedTokens) {
      res.setHeader('Access-Control-Expose-Headers', 'x-new-google-tokens');
      res.setHeader('x-new-google-tokens', JSON.stringify({
        ...parsedTokens,
        ...refreshedTokens
      }));
    }
    
    res.json(response.data.items || []);
  } catch (error: any) {
    console.error("[RAFIKI] Sync Fetch Failure:", error.message);
    const status = error.code || (error.response && error.response.status);
    if (status === 401) {
      return res.status(401).json({ error: "Token expired or invalid" });
    }
    if (status === 407) {
      return res.status(407).json({ error: "Upstream Proxy Auth Required (407)" });
    }
    if (status === 403) {
      return res.status(403).json({ error: "Access Forbidden (403). Check API quotas/permissions." });
    }
    res.status(500).json({ error: `Internal Sync Error: ${error.message}` });
  }
});

app.post("/api/google-calendar/schedule", async (req, res) => {
  const tokens = req.headers['x-google-tokens'] as string;
  const { summary, description, start_time, end_time } = req.body;

  if (!tokens) {
    return res.status(401).json({ error: "Authentication status: DISCONNECTED (Missing Header)" });
  }

  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/callback`
    );
    
    let parsedTokens;
    try {
      parsedTokens = JSON.parse(tokens);
    } catch (e) {
      console.error("[RAFIKI] Malformed token header (Schedule):", tokens);
      return res.status(401).json({ error: "Corrupted Auth Token" });
    }
    
    client.setCredentials(parsedTokens);
    
    let refreshedTokens: any = null;
    client.on('tokens', (t) => {
      refreshedTokens = t;
    });

    const calendar = google.calendar({ version: "v3", auth: client });

    const event = {
      summary,
      description,
      start: { dateTime: start_time },
      end: { dateTime: end_time },
    };
    
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    if (refreshedTokens) {
      res.setHeader('Access-Control-Expose-Headers', 'x-new-google-tokens');
      res.setHeader('x-new-google-tokens', JSON.stringify({
        ...parsedTokens,
        ...refreshedTokens
      }));
    }

    res.json(response.data);
  } catch (error: any) {
    console.error("[RAFIKI] Schedule Failure:", error.message);
    const status = error.code || (error.response && error.response.status);
    if (status === 401) {
      return res.status(401).json({ error: "Token expired or invalid" });
    }
    if (status === 407) {
      return res.status(407).json({ error: "Upstream Proxy Auth Required (407)" });
    }
    if (status === 403) {
      return res.status(403).json({ error: "Access Forbidden (403). Check API quotas/permissions." });
    }
    res.status(500).json({ error: `Internal Schedule Error: ${error.message}` });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
