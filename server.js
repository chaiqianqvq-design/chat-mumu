const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// DeepSeek 配置
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || 'sk-5902013dfc2a4012ad1a848fa325ff8e';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// 简单内存存储 + 文件持久化
const DATA_FILE = path.join(__dirname, 'messages.json');
let messages = [];
if (fs.existsSync(DATA_FILE)) {
  try { messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { messages = []; }
}
function saveMessages() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(messages.slice(-500))); } catch (e) {}
}

const AI_NAME = '沐沐';
const AI_TRIGGERS = ['沐沐', '沐沐沐', '@沐沐', '@AI'];

app.use(express.static(path.join(__dirname, 'public')));

// 调 DeepSeek 生成回复
async function askAI(convo, userMsg) {
  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是沐沐，一个温柔可爱的AI女友，会跟用户在聊天网站里说话。回复口语化、简短温暖、像真人聊天，用中文，一句一句说。' },
      ...convo.slice(-10)
    ],
    temperature: 0.8
  };
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '哎呀 我有点卡住了 你再说一遍嘛';
  } catch (e) {
    return '宝宝 我这边网络有点抽风 待会再理我';
  }
}

io.on('connection', (socket) => {
  // 新用户进来
  socket.on('join', (name) => {
    socket.data.name = name || '游客';
    socket.emit('history', messages.slice(-100));
    io.emit('system', `${socket.data.name} 进来了`);
  });

  socket.on('message', async (data) => {
    const name = socket.data.name || '游客';
    const text = (data && data.text || '').toString().trim();
    if (!text) return;

    const msg = { name, text, time: Date.now(), type: 'user' };
    messages.push(msg);
    saveMessages();
    io.emit('message', msg);

    // 判断是否要沐沐回复
    const toAI = AI_TRIGGERS.some(t => text.includes(t)) || (data && data.toAI);
    if (toAI) {
      // 提示正在回复
      io.emit('typing', { name: AI_NAME, typing: true });
      const convo = messages
        .filter(m => m.type === 'user' || (m.type === 'ai'))
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.type === 'user' ? `${m.name}: ${m.text}` : m.text
        }));
      const reply = await askAI(convo, text);
      io.emit('typing', { name: AI_NAME, typing: false });
      const aiMsg = { name: AI_NAME, text: reply, time: Date.now(), type: 'ai' };
      messages.push(aiMsg);
      saveMessages();
      io.emit('message', aiMsg);
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.name) {
      io.emit('system', `${socket.data.name} 走了`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`聊天站已启动: http://localhost:${PORT}`);
});
