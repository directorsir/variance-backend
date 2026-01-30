const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const AUDIO_DIR = path.join(__dirname, "audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

/* =========================
   SIMPLE AI BRAIN (TEMP)
   ========================= */
function decideResponse(text) {
  const t = text.toLowerCase();

  if (t.includes("accident") || t.includes("crash") || t.includes("hit")) {
    return "I’m sorry that happened. Were you physically injured in the accident?";
  }

  return "Thank you. What type of legal help are you looking for today?";
}

/* =========================
   AURA-2 TEXT → SPEECH
   ========================= */
async function generateAuraAudio(text, filename) {
  const outputPath = path.join(AUDIO_DIR, filename);

  const response = await axios.post(
    "https://api.deepgram.com/v1/speak?model=aura-2",
    { text },
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  fs.writeFileSync(outputPath, response.data);
  return `${process.env.PUBLIC_BASE_URL}/audio/${filename}`;
}

/* =========================
   TWILIO ENTRY POINT
   ========================= */
app.post("/voice", (req, res) => {
  res.type("text/xml").send(`
<Response>
  <Say>
    Hello. Before we begin, I am not an attorney,
    and this call does not create an attorney client relationship.
  </Say>

  <Gather input="speech" action="/gather" method="POST" speechTimeout="auto">
    <Say>Please tell me briefly how I can help you today.</Say>
  </Gather>

  <Say>Goodbye.</Say>
</Response>
  `);
});

/* =========================
   HANDLE SPEECH → AI → VOICE
   ========================= */
app.post("/gather", async (req, res) => {
  const speech = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;

  console.log("Caller said:", speech);

  const aiText = decideResponse(speech);
  const audioFile = `response-${Date.now()}.wav`;

  try {
    const audioUrl = await generateAuraAudio(aiText, audioFile);

    await client.calls(callSid).update({
      twiml: `
<Response>
  <Play>${audioUrl}</Play>

  <Gather input="speech" action="/gather" method="POST" speechTimeout="auto">
    <Say>You can continue.</Say>
  </Gather>
</Response>
      `,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Voice injection error:", err.message);
    res.sendStatus(500);
  }
});

/* =========================
   SERVE AUDIO FILES
   ========================= */
app.use("/audio", express.static(AUDIO_DIR));

/* =========================
   HEALTH CHECK
   ========================= */
app.get("/", (req, res) => {
  res.send("Aura-2 voice server is live.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});