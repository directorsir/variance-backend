const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* =========================
   TWILIO CLIENT
   ========================= */
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* =========================
   AUDIO STORAGE
   ========================= */
const AUDIO_DIR = path.join(__dirname, "audio");
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

/* =========================
   HUMAN-TUNED AI BRAIN
   (speech-first wording)
   ========================= */
function decideResponse(text) {
  const t = text.toLowerCase();

  if (t.includes("accident") || t.includes("crash") || t.includes("hit")) {
    return "I’m really sorry that happened… Were you hurt at all?";
  }

  return "Okay… what kind of legal help are you looking for?";
}

/* =========================
   AURA-2 TEXT → SPEECH
   (voice primed)
   ========================= */
async function generateAuraAudio(text) {
  const filename = `response-${Date.now()}.wav`;
  const filePath = path.join(AUDIO_DIR, filename);

  const response = await axios.post(
    "https://api.deepgram.com/v1/speak?model=aura-2",
    {
      text: `
You are a calm, empathetic legal intake assistant speaking on the phone.
Use natural pacing, short pauses, and a reassuring tone.
Do not sound robotic. Do not rush.

${text}
      `
    },
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  fs.writeFileSync(filePath, response.data);

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

  <Gather
    input="speech"
    action="/gather"
    method="POST"
    speechTimeout="auto"
  >
    <Say>
      Please tell me, in your own words, how I can help you today.
    </Say>
  </Gather>

  <Say>Goodbye.</Say>
</Response>
  `);
});

/* =========================
   SPEECH → AI → VOICE LOOP
   ========================= */
app.post("/gather", async (req, res) => {
  const speech = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;

  console.log("Caller said:", speech);

  try {
    const aiText = decideResponse(speech);
    const audioUrl = await generateAuraAudio(aiText);

    // 🔑 REST CALL IS THE ONLY CALL CONTROLLER
    await client.calls(callSid).update({
      twiml: `
<Response>
  <Play>${audioUrl}</Play>

  <Gather
    input="speech"
    action="/gather"
    method="POST"
    speechTimeout="auto"
  >
    <Say>Take your time.</Say>
  </Gather>
</Response>
      `,
    });

    // 🔑 MUST RETURN EMPTY 200
    res.sendStatus(200);

  } catch (err) {
    console.error("Gather error:", err.message);
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
  res.send("Aura-2 human-tuned voice server is live.");
});

/* =========================
   START SERVER
   ========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});