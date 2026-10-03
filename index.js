import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 8787;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, name: 'ORIX' }));

app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' });
    }

    const safeMessages = messages.slice(-30).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 12000),
    }));

    const response = await openai.responses.create({
      model: 'gpt-5.6-luna',
      instructions:
        'You are ORIX, a helpful, concise, friendly AI assistant. Give accurate answers. Format clearly with markdown when useful.',
      input: safeMessages,
      store: false,
    });

    res.json({ text: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ORIX could not generate a response.' });
  }
});

app.listen(port, () => {
  console.log(`ORIX server running on http://localhost:${port}`);
});
