const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const querystring = require("querystring");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/**
 * ========= TWILIO ENTRY POINT =========
 * Answers the call and starts streaming
 */
app.post("/voice", (req, res) => {
  console.log("Incoming call");

  res.type("text/xml").send(`
<Response>
  <Say>
    Hello. Before we begin, I am not an attorney,
    and this call does not create an attorney client relationship.
    Please tell me briefly how I can help you today.
  </Say>

  <Connect>
    <Stream url="wss://variance-backend.onrender.com/stream" />
  </Connect>

  <Pause length="60" />
</Response>
  `);
});

/**
 * ========= AI VOICE RESPONSE =========
 * Speaks what the AI decided
 */
app.post("/respond", (req, res) => {
  const { message } = req.query;

  console.log("AI speaking:", message);

  res.type("text/xml").send(`
<Response>
  <Say>${message}</Say>
  <Pause length="30" />
</Response>
  `);
});

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("Backend is live.");
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

/**
 * ========= SIMPLE BRAIN =========
 */
function decideResponse(transcript) {
  const text = transcript.toLowerCase();

  if (
    text.includes("accident") ||
    text.includes("crash") ||
    text.includes("hit")
  ) {
    return "I am sorry that happened. Were you physically injured in the accident?";
  }

  return "Thank you. What type of legal help are you looking for today?";
}

/**
 * ========= TWILIO MEDIA STREAM =========
 */
const wss = new WebSocket.Server({
  server,
  path: "/stream",
});

wss.on("connection", (twilioSocket) => {
  console.log("Twilio stream connected");

  let deepgramReady = false;
  let streamStarted = false;
  let responseSent = false;

  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=phonecall&encoding=mulaw&sample_rate=8000&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    deepgramReady = true;
    console.log("Deepgram connected");
  });

  deepgramSocket.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      return;
    }

    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (
      transcript &&
      transcript.length > 0 &&
      !responseSent
    ) {
      responseSent = true;

      console.log("Caller said:", transcript);

      const aiResponse = decideResponse(transcript);

      const redirectUrl =
        "/respond?" +
        querystring.stringify({ message: aiResponse });

      /**
       * Tell Twilio to redirect the call
       */
      twilioSocket.send(
        JSON.stringify({
          event: "redirect",
          redirect: {
            url: `https://variance-backend.onrender.com${redirectUrl}`,
          },
        })
      );

      console.log("Redirecting to speak AI response");
    }
  });

  twilioSocket.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        streamStarted = true;
        console.log("Twilio stream started");
      }

      if (
        data.event === "media" &&
        deepgramReady &&
        streamStarted &&
        deepgramSocket.readyState === WebSocket.OPEN
      ) {
        const audioBuffer = Buffer.from(
          data.media.payload,
          "base64"
        );
        deepgramSocket.send(audioBuffer);
      }
    } catch (err) {
      console.error("Twilio stream error:", err.message);
    }
  });

  twilioSocket.on("close", () => {
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close();
    }
    console.log("Twilio stream disconnected");
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});